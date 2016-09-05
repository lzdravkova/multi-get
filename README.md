# multiGet

This script downloads a file in parts. It will work with any size file, but if the file is larger than X = chunk size * number of chunks, then only the first X bytes of the file will be downloaded.

To run:
> node multiGet <url> [options]
options:
  -parallel   : if set chunks will be requested in parallel
  -o=<path>   : output file location
  -s=<number> : size of chunks
  -n=<number> : number of chunks

Tested with Node.js v4.5.0
