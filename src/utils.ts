import * as vscode from "vscode";
import * as cp from "child_process";
import { getRacket, getRacketShellCmd } from "./config";

export function execShell(cmd: string, workingDir: string | undefined = undefined) : Promise<string> {
    return new Promise<string>((resolve, reject) => {
        cp.exec(cmd, 
            { cwd: workingDir || vscode.workspace.getConfiguration("vscode-fracas.general").get<string>("projectDir") },
            (err, out) => {
                if (err) {
                    vscode.window.showErrorMessage(err.message);
                    return reject(err);
                }
                return resolve(out);
            });
    });
}

export function kebabCaseToPascalCase(input: string): string
{
  return input
    .split("-")
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
