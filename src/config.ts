import * as vscode from "vscode";
import * as path from "path";
import * as ini from "ini";
import { type } from "os";

const kOsType = type();
const kOsCfgSuffix =
    kOsType === 'Linux' ? 'linux' :
        kOsType === 'Darwin' ? 'macos' :
            'windows';
const kOsUe4Name =
    kOsType === 'Linux' ? 'Linux' :
        kOsType === 'Darwin' ? 'Mac' :
            'Win64';
const kOsBinExt = kOsType === 'Windows_NT' ? '.exe' : '';

export function getProjectFolder(): vscode.WorkspaceFolder {
    const projectDir = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string>("projectWorkspaceFolder") ?? ".";
    const folder = vscode.workspace.workspaceFolders?.find(folder => folder.name === projectDir);
    if (!folder) {
        throw vscode.FileSystemError.FileNotFound(`Project folder ${projectDir} not found.`);
    }
    return folder;
}

export function getProjectDir(): string {
    const folder = getProjectFolder();
    return folder.uri.fsPath;
}

const kCfgFiles: { [key: string]: unknown }[] = [];
export async function loadProjectConfig(): Promise<void> {
    // parse username.cfg and ws.cfg ini files
    // const cfgPaths = vscode.workspace
    //     .getConfiguration("vscode-fracas.general")
    //     .get<string[]>("projectConfiguration") ?? [];
    const cfgPaths = [["cfg", `${process.env.USERNAME}.cfg`], ["cfg", "ws.cfg"]];
    const projectFolder = getProjectFolder();
    kCfgFiles.length = 0; // clear previous configs
    for (const cfgPath of cfgPaths) {
        const cfgUri = vscode.Uri.joinPath(projectFolder.uri, ...cfgPath);
        try {
            const cfg = await vscode.workspace.fs.readFile(cfgUri);
            const config = ini.parse(cfg.toString());
            kCfgFiles.push(config);
        } catch {
            vscode.window.showWarningMessage(`cfg file not found or unreadable: ${cfgUri.fsPath}`);
        }
    }
}

let cfgWatcher: vscode.FileSystemWatcher;
export function watchProjectConfig(): void {
    if (!cfgWatcher) {
        const cfgPattern = new vscode.RelativePattern(getProjectFolder(), 
            `cfg/{${process.env.USERNAME}.cfg,ws.cfg}`);
        cfgWatcher = vscode.workspace.createFileSystemWatcher(cfgPattern);
        cfgWatcher.onDidCreate(loadProjectConfig);
        cfgWatcher.onDidChange(loadProjectConfig);
        cfgWatcher.onDidDelete(loadProjectConfig);
    }
}

export function getProjectConfig(sectionName: string, key: string): unknown {
    // find the first matching key in the config files
    for (const cfg of kCfgFiles) {
        const section = cfg[sectionName] as Record<string, unknown>;
        if (section) {
            if (section[key]) {
                return section[key];
            }
        }
    }

    return undefined;
}

export function getWonderstormConfig(key: string): unknown {
    return getProjectConfig("wonderstorm", key);
}


export function getRacket(server = false): [string, string[]] {
    const projectDir = getProjectDir();
    const racketDir = getWonderstormConfig(`racket_${kOsCfgSuffix}`) as string;
    const racketPath = path.normalize(path.join(racketDir, `racket${kOsBinExt}`));
    const collectPaths = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string[]>("racketCollectionPaths") ?? [];
    const racketArgs = [];
    for (const collectPath of collectPaths) {
        racketArgs.push("-S", path.resolve(projectDir, collectPath));
    }
    return [racketPath, racketArgs];
}

export function getRacketShellCmd(server = false): string {
    const [racket, racketArgs] = getRacket(server);
    // quote racket args
    const racketArgString = racketArgs.length === 0 ? '' : 
        `"${racketArgs.join('" "')}"`;
    return `${racket} ${racketArgString}`;
}

export function getNinja(): string {
    const ninja = getWonderstormConfig(`ninja_${kOsCfgSuffix}`) as string;
    return path.normalize(ninja);
}

export function getUnreal(): string {
    const unreal = getWonderstormConfig(`unreal_${kOsCfgSuffix}`) as string;
    return path.normalize(unreal);
}

export function getPython(): string {
    const unreal = getUnreal();
    return path.join(unreal, "Engine", "Binaries", "ThirdParty", "Python3", kOsUe4Name, `python${kOsBinExt}`);
}

let yasiScript = "yasi_ws.py";
export function getFormatterScript(): string { return yasiScript; }
export function setFormatterScript(script: string): void { yasiScript = script; }
