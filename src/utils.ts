import treeKill = require("tree-kill");
import * as os from "os"
import * as vscode from "vscode";
import * as cp from "child_process";
import { fracasOut, getProjectDir, getRacket, getRacketShellCmd } from "./config";
import stream = require("stream");

export interface ExecOptions {
    input?: string;
    workingDir?: string;
    showErrors: boolean;
    timeoutMillis: number;
    lowPriority?: boolean;
    serializedExecutionKey?: string; // unique id for the command. If a previous instance is still running, cancel it before executing the new one.
}

const runningProcesses: Map<string, cp.ChildProcess> = new Map();
export function execShell(
    cmd: string,
    options: ExecOptions = { showErrors: true, workingDir: getProjectDir(), timeoutMillis: 60_000 },
    token?: vscode.CancellationToken
) : Promise<string> {
    fracasOut.appendLine(`From working dir: '${options.workingDir}'`);
    fracasOut.appendLine(`Executing: '${cmd}'`);

    // kill previous process if it is still running
    if (options.serializedExecutionKey) {
        const previousProcess = runningProcesses.get(options.serializedExecutionKey);
        if (previousProcess) {
            if (previousProcess.exitCode === null) {
                treeKill(previousProcess.pid);
            }
        }
    }
    
    // launch the process
    return new Promise<string>((resolve, reject) => {
        const child = cp.exec(cmd,
            { cwd: options.workingDir, timeout: options.timeoutMillis },
            (error, stdout) => {
                if (error) {
                    if (options.showErrors) {
                        vscode.window.showErrorMessage(error.message + "\n" + stdout);
                    }
                    fracasOut.appendLine(`Command failed '${cmd}':`);
                    fracasOut.appendLine(`${error.name}: ${error.message}`);
                    if (error.stack) {
                        fracasOut.appendLine(error.stack);
                    }
                    
                    reject(error);
                }
                
                resolve(stdout);
            });

        // keep track of this execution
        if (options.serializedExecutionKey) {
            runningProcesses.set(options.serializedExecutionKey, child);
        }
        
        // Kill the child process if the token is cancelled
        token?.onCancellationRequested(() => { 
            if (child.exitCode === null) { 
                treeKill(child.pid); 
            } 
        });
        
        // nice the process if it's low priority
        if (options.lowPriority) {
            os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
        }

        // if an input is given, pipe it to the child process
        if (options.input && child.stdin) {
            const stdinStream = new stream.Readable();
            stdinStream.push(options.input);  // Add data to the internal queue for users of the stream to consume
            stdinStream.push(null);   // Signals the end of the stream (EOF)
            stdinStream.pipe(child.stdin);
        }
    });
}

export function execShellWithProgress(
    cmd: string,
    title: string,
    options: ExecOptions = { showErrors: true, workingDir: getProjectDir(), timeoutMillis: 60_000 }
) : Thenable<string> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: title
    }, async (progress, token) => {
        progress.report({  message: "Working..." });
        const output = await execShell(cmd, options, token);
        progress.report({ message: "Done!" });
        return output;
    }).then(undefined, (error) => error );
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
