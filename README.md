# Overview

This module is a simple [DeluxePaint](https://en.wikipedia.org/wiki/Deluxe_Paint) [LBM](https://en.wikipedia.org/wiki/ILBM) converter tool.  It can convert LBMs and BBMs to JSON (including the palette, color cycling data and raw pixel indexes), or PNGs.

# Usage

Use [npm](https://www.npmjs.com/) to install the module as a command-line executable:

```
sudo npm install -g lbmtool
```

Then call it using `lbmtool` and specify a path to your source LBM file:

```
lbmtool MYLBMFILE.LBM
```

By default the converted JSON data is printed to the console.  If you would rather send it to a file, add the `--json` flag with a destination filename:

```
lbmtool MYLBMFILE.LBM --json MYJSONFILE.JSON
```

Fancy a PNG instead?  Use the `--png` flag and a filename:

```
lbmtool MYLBMFILE.LBM --png MYPNGFILE.PNG
```

If you are using OS X, the tool can also open the image for viewing:

```
lbmtool MYLBMFILE.LBM --view
```

You can combine any or all of the above flags.

## Sample Output

Here is sample JSON output from a LBM file.  Note that the palette and pixel data is chopped for brevity:

```json
{
	"filename": "SCENE.LBM",
	"width": 640,
	"height": 480,
	"compression": "cmpByteRun1",
	"masking": "mskHasMask",
	"transparentColor": 224,
	"colors": [
		[ 255, 255, 255 ],
		[ 7, 23, 27 ],
		...
	],
	"cycles": [
		{
			"reverse": 2,
			"rate": 0,
			"low": 69,
			"high": 75
		},
		{
			"reverse": 0,
			"rate": 1842,
			"low": 169,
			"high": 180
		},
		...
	],
	"pixels": [
		0, 45, 255, 0, 0, 0, 0, ...
	]
}
```

The `compression` and `masking` properties are only included for informational purposes.  The pixel data is completely decompressed and demasked in the JSON `pixels` array.  The `transparentColor` denotes which palette index should be transparent.

# License (MIT)

**The MIT License**

*Copyright (c) 2019 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
