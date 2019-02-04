#!/usr/bin/env node

// DeluxePaint LBM Converter Tool
// Copyright (c) 2019 Joseph Huckaby, MIT License

// Usage: 
//	lbmtool LBMFILE.LBM --json  ## to stdout
//	lbmtool LBMFILE.LBM --json JSONFILE.JSON
//	lbmtool LBMFILE.LBM --png PNGFILE.PNG
//	lbmtool LBMFILE.LBM --view  ## View Image (OSX only)

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const zlib = require('zlib');
const cli = require('pixl-cli');
const IFFParser = require('iff-parser');
const CRC32 = require('crc-32');

var args = cli.args;
if (!args.other || !args.other.length) {
	cli.die("Usage: lbmtool LBMFILE.LBM [--json JSONFILE.JSON] [--png PNGFILE.PNG] [--view]\n");
}
if (!args.json && !args.png && !args.view) {
	// default to JSON STDOUT
	args.json = true; 
}
if (args.view && !args.png) {
	// create temp PNG file in order to view it
	args.png = os.tmpdir() + "/" + cli.Tools.generateShortID() + ".png";
}

// PNG file format chunk type ids
var pngChunkTypes = {
	TYPE_IHDR: 0x49484452,
	TYPE_IEND: 0x49454e44,
	TYPE_IDAT: 0x49444154,
	TYPE_PLTE: 0x504c5445,
	TYPE_tRNS: 0x74524e53,
	TYPE_gAMA: 0x67414d41
};

var packPNGChunk = function(type, data) {
	// pack one chunk of PNG data (len, type, data, CRC32 checksum)
	// returns new buffer
	var len = (data ? data.length : 0),
	buf = Buffer.alloc(len + 12);
	
	buf.writeUInt32BE(len, 0);
	buf.writeUInt32BE(type, 4);
	
	if (data) data.copy(buf, 8);
	
	buf.writeInt32BE( CRC32.buf(buf.slice(4, buf.length - 4)), buf.length - 4 );
	
	return buf;
};

var filename = cli.args.other.shift();
var parser = new IFFParser.Parser(filename, {});

parser.parse(function(err, file) {
	// Now parse chunks
	if (err) {
		cli.die("ERROR: Failed to parse LBM file: " + file + ": " + err + "\n");
	}
	
	var root = file.content;
	var colorMap = root.chunkById('CMAP');
	var properties = root.chunkById('BMHD');
	var body = root.chunkById('BODY');
	
	// start creating JSON structure
	var json = {
		filename: filename,
		width: properties.width,
		height: properties.height,
		compression: properties.compression,
		masking: properties.masking,
		transparentColor: properties.transparentColor,
		colors: [],
		cycles: [],
		pixels: []
	};
	
	colorMap.colors.forEach( function(color) {
		// convert palette to array of RGB triplets, e.g. [0,128,255]
		json.colors.push([ color.red, color.green, color.blue ]);
	} );
	
	root.chunksById('CRNG').forEach( function(chunk) {
		// fix byte encoding for cycle palette locations
		// these are UNSIGNED chars, not regular chars (bug in iff-parser)
		chunk.low = chunk.ckData.readUInt8(6);
		chunk.high = chunk.ckData.readUInt8(7);
		
		// convert to our style
		json.cycles.push({
			reverse: chunk.active,
			rate: chunk.rate,
			low: chunk.low,
			high: chunk.high
		});
	});
	
	// decode pixels
	if (properties.compression == 'cmpByteRun1') {
		// ByteRun1 decompression
		var buf = body.ckData;
		var len = buf.length;
		var offset = 0;
		var value = buf.readInt8(offset++);
		
		while (offset < len) {
			if (value >= 0) {
				// [0..127]: followed by n+1 bytes of data.
				for (var idx = 0; idx <= value; idx++) {
					json.pixels.push( buf.readUInt8(offset++) );
				}
			}
			else if ((value <= -1) && (value >= -127)) {
				// [-1..-127]: followed by byte to be repeated (-n)+1 times
				var ref = buf.readUInt8(offset++);
				for (var idx = 0; idx <= 0 - value; idx++) {
					json.pixels.push( ref );
				}
			}
			else {
				// -128: NOOP.
			}
			if (offset < len) value = buf.readInt8(offset++);
		} // while
	}
	else {
		// no compression, just copy over as is
		for (var idx = 0; idx < len; idx++) {
			json.pixels.push( buf.readUInt8(offset++) );
		}
	}
	
	// decode interleaved masking bits
	// this darn thing has eluded me since 2002, but now FINALLY SOLVED!
	// thanks to: https://github.com/wiesmann/ilbm.js
	if (properties.masking == "mskHasMask") {
		var new_pixels = new Array( json.width * json.height );
		var planes = properties.planes + 1;
		var row_bytes = ((json.width + 15) >> 4) << 1;
		
		for (var y = 0; y < json.height; y++) {
			for (var p = 0; p < planes; p++) {
				var plane_mask = 1 << p;
				
				for (var i = 0; i < row_bytes; i++) {
					var bit_offset = (y * planes * row_bytes) + (p * row_bytes) + i;
					var bit_value = json.pixels[bit_offset];
					
					for (var b = 0; b < 8; b++) {
						var pixel_mask = 1 << (7 - b);
						
						if (bit_value & pixel_mask) {
							var x = (i * 8) + b;
							new_pixels[(y * json.width) + x] |= plane_mask;
						}
					}
				}
			}
		}
		
		json.pixels = new_pixels;
	} // masking
	
	// optionally just return the count of pixels, not the full array
	if (args.nopixels) json.pixels = json.pixels.length;
	
	// produce desired output
	if (args.json === true) {
		// JSON to STDOUT
		console.log( JSON.stringify(json) );
	}
	else if (args.json) {
		// save to JSON file
		fs.writeFileSync( args.json, JSON.stringify(json) + "\n" );
		console.log("Saved JSON to file: " + args.json);
	}
	else if (args.png) {
		// produce 8-bit PNG from pixel/color data
		var transparentColor = (json.masking === 'mskHasTransparentColor') ? json.transparentColor : null;
		
		// first, build PNG palette structure
		var palette_offset = 0;
		var palette_data = new Uint8Array( json.colors.length * 3 );
		var alpha_data = new Uint8Array( json.colors.length );
		var cur_color = null;
		
		for (var idx = 0, len = json.colors.length; idx < len; idx++) {
			cur_color = json.colors[idx];
			palette_data[ (palette_offset * 3) + 0 ] = cur_color[0];
			palette_data[ (palette_offset * 3) + 1 ] = cur_color[1];
			palette_data[ (palette_offset * 3) + 2 ] = cur_color[2];
			alpha_data[ palette_offset ] = (idx === transparentColor) ? 0 : 255;
			palette_offset++;
		}
		
		// next, build PNG pixel array (different than raw pixel array, has extra byte per row)
		var src_offset = 0;
		var pixel_offset = 0;
		var pixel_data = new Uint8Array( (json.width * json.height) + json.height ); // added extra 'height' for stupid filter bytes on each row
		
		for (var y = 0, ymax = json.height; y < ymax; y++) {
			// foreach row
			pixel_data[ pixel_offset++ ] = 0; // add filter byte
			
			for (var x = 0, xmax = json.width; x < xmax; x++) {
				// for each pixel
				pixel_data[ pixel_offset++ ] = json.pixels[ src_offset++ ];
			} // x loop
		} // y loop
		
		// start building png file structure
		var chunks = [];
		
		// file signature (PNG magic number)
		chunks.push( Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) );
		
		// IHDR header chunk
		buf = Buffer.alloc(13);
		
			buf.writeUInt32BE(json.width, 0);
			buf.writeUInt32BE(json.height, 4);
			
			buf[8] = 8; // 8-bit depth
			buf[9] = 3; // indexed colorType
			buf[10] = 0; // gzip compression (yes, 0 = gzip)
			buf[11] = 0; // no filter (useless for indexed palette images)
			buf[12] = 0; // no interlace
		
		chunks.push( packPNGChunk(pngChunkTypes.TYPE_IHDR, buf) );
		
		// PLTE palette chunk
		chunks.push( packPNGChunk(pngChunkTypes.TYPE_PLTE, Buffer.from(palette_data.buffer) ) );
		
		// tRNS alpha chunk (only if alpha)
		if (transparentColor !== null) {
			chunks.push( packPNGChunk(pngChunkTypes.TYPE_tRNS, Buffer.from(alpha_data.buffer) ) );
		}
		
		// IDAT data chunk
		chunks.push( packPNGChunk(pngChunkTypes.TYPE_IDAT, zlib.deflateSync( Buffer.from(pixel_data.buffer), {
			level: 9,
			memLevel: 9,
			strategy: zlib.constants ? zlib.constants.Z_RLE : zlib.Z_RLE
			// From zlib.net: Z_RLE is designed to be almost as fast as Z_HUFFMAN_ONLY, but give better compression for PNG image data.
		} )) );
		
		// IEND end chunk
		chunks.push( packPNGChunk(pngChunkTypes.TYPE_IEND, null) );
		
		// concat chunks into single buffer
		var pngBuffer = Buffer.concat(chunks);
		
		// save as file
		if (args.png) {
			fs.writeFileSync( args.png, pngBuffer );
			console.log("Saved PNG to file: " + args.png);
			
			if (args.view) {
				// open image in OS X Preview.app
				console.log("Opening PNG image...");
				cp.execSync( '/usr/bin/open "' + args.png + '"' );
			}
		}
	}
	
}); // parse


