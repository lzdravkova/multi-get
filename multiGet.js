"use strict";

var http = require("http");
var fs = require("fs");
var url = require("url");

//
// FileManager provides write streams to a file
//
class FileManager {
    getStream(offset) {
        if (!this._isCreated) {
            fs.createWriteStream(this.file).close();
            this._isCreated = true;
        }
        return fs.createWriteStream(this.file, { flags: "r+", start: offset });
    }

    constructor(file) {
        this.file = file;
        this._isCreated = false;
    }
}

//
// This file is called every time a response is received and determines 
// if we are done and whether everything was successful. 
//
function onChunkDone(params, isSuccess) {
    if (isSuccess) {
        params.chunksOk++;
        if (params.serial && params.chunksOk < params.numChunks) {
            getChunk(params.chunksOk, params);  //if serial get next chunk
        }
    } else {
        if (params.serial) { //if serial fail all the rest when there is one failure
            params.chunksFailed = params.numChunks - params.chunksOk;
        } else {
            params.chunksFailed++;
        }
    }

    //if we have received the expected number of chunks then we are done
    if ((params.chunksOk + params.chunksFailed) == params.numChunks) {
        if (params.chunksFailed == 0) {
            console.log("Success!");
        } else {
            console.log("Failed.");
        }
    }
}

//
// This function creates a callback to handle the response from a chunk request.
// This will work for any size files, including if the file is smaller than the chunk size.
// If the range in the request was past the end of the file it doesn't write anything to the file.
// The failure cases would be if the file was not found (404) or other errors.
//
function createCallback(index, params) {
    return (response) => {
        if (response.statusCode == 206) { //Partial Content
            let fileStream = params.fileManager.getStream(index * params.chunkSize);
            response.pipe(fileStream);
            response.on('end', () => {
                onChunkDone(params, true);
            });
        } else if (response.statusCode == 416) { //Request Range Not Satisfiable
            onChunkDone(params, true);
        } else {
            console.log("Could not get the chunk at index " + index + "\nThe server responded with: " + response.statusCode + " - " + response.statusMessage); 
            onChunkDone(params, false);
        }
    };
}

//
// This file makes a request for a single chunk at the given index. 
// If the index is past the number of required chunks then it does nothing.
//
function getChunk(index, params) {
    if (index == params.numChunks) return;

    let options = {
        host: params.host,
        path: params.path,
        port: params.port,
        headers: {
            'Range': 'bytes=' + index * params.chunkSize + '-' + ((index + 1) * params.chunkSize - 1)
        }
    };

    let request = http.get(options, createCallback(index, params));
    request.on('error', (error) => {
        console.log("Could not get the chunk at index " + index + "\nAn error occurred: " + error.message); 
        return;
    });
}

//
// This function sets up all the parameters. 
// It sets defaults and overrides them if that parameter is specified in the command line arguments.
// At least one command line argument is required, which is the URL of the file.
//
function main(args) {
    // args = [ node path, JS file path, other parameters ... ]
    if (args.length < 3) {  //if no arguments are specified
        console.log(
            "Usage: multiGet <url> [options]\n" +
            "options:\n" +
            "  -parallel   : if set chunks will be requested in parallel\n" +
            "  -o=<path>   : output file location\n" +
            "  -s=<number> : size of chunks\n" +
            "  -n=<number> : number of chunks\n"
        )
        return;
    };

    let myUrl = url.parse(args[2]);
    if (!myUrl['hostname']) {
        console.log("Error: Invalid URL. Hostname must be specified");
        return;
    }

    //set the defaults
    let params = {
        filePath: "./" + args[2].substring(args[2].lastIndexOf("/") + 1),
        serial: true,
        chunkSize: 1048576,
        numChunks: 4,
        host: myUrl['hostname'],
        path: myUrl['path'],
        port: myUrl['port']
    }

    //parse the command line arguments
    for (let i = 3; i < args.length; i++) {
        let arg = args[i].split("=");
        if (arg[0] == "-parallel") {
            params.serial = false;
        } else if (arg[0] == "-o") {
            params.filePath = arg[1];
        } else if (arg[0] == "-s") {
            params.chunkSize = arg[1];
            if (isNaN(params.chunkSize)) {
                console.log("Error: -s must specify a number");
                return;
            }
        } else if (arg[0] == "-n") {
            params.numChunks = arg[1];
            if (isNaN(params.numChunks)) {
                console.log("Error: -n must specify a number");
                return;
            }
        }
    }

    params.fileManager = new FileManager(params.filePath);

    params.chunksOk = 0;
    params.chunksFailed = 0;
        
    //get the file
    getChunk(0, params);
    if (!params.serial) {
        for (let i = 1; i < params.numChunks; i++) {
            getChunk(i, params);
        }
    }
}

main(process.argv);
