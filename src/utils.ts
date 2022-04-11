import * as vscode from "vscode";
import * as cp from "child_process";
import { getProjectDir, getRacket, getRacketShellCmd } from "./config";
import stream = require("stream");

export function execShell(cmd: string, input?: string, workingDir?: string) : Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const child = cp.exec(cmd, 
            { cwd: workingDir ?? getProjectDir() },
            (err, out) => {
                if (err) {
                    vscode.window.showErrorMessage(err.message);
                    return reject(err);
                }
                return resolve(out);
            });

        // if an input is given, pipe it to the child process
        if (input && child.stdin) {
            const stdinStream = new stream.Readable();
            stdinStream.push(input);  // Add data to the internal queue for users of the stream to consume
            stdinStream.push(null);   // Signals the end of the stream (EOF)
            stdinStream.pipe(child.stdin);            
        }
    });
}

export function kebabCaseToPascalCase(input: string): string
{
  return input
    .split("-")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .reduce((camel, word, index) => {
        const pascalWord = word.substring(1).toLowerCase();
        return `${camel}${word.charAt(0).toUpperCase()}${pascalWord}`;
    }, "");
}

export function openRacketReference(symbol: string): void {
    vscode.env.openExternal(vscode.Uri.parse(`https://docs.racket-lang.org/search/index.html?q=${encodeURI(symbol)}`));
}

export function delay(ms: number) : Promise<void> {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

export function withRacket(func: (racketPath: string, racketArgs: string[]) => void, server = false): void {
    const [racket, racketArgs] = getRacket(server);
    if (racket) {
        func(racket, racketArgs);
    }
}

export function withRacketShellCmd(func: (racketCmd: string) => void, server = false): void {
    const racketCmd = getRacketShellCmd(server);
    if (racketCmd) {
        func(racketCmd);
    }
}
