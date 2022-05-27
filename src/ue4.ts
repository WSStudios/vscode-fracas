import * as http from 'http';
import * as vscode from "vscode";
import { fracasOut } from './config';

export function ue4GetSelectedAssetPaths(): string[] {
    // if no assetPath is provided, use the current selection
    const activeEditor = vscode.window.activeTextEditor;
    const document = activeEditor?.document;
    const selections: readonly vscode.Selection[] | undefined = activeEditor?.selections;
    if (!document || !selections) {
        return [];
    }

    // Resolve selections into asset paths
    // NameTypes.h
    // /** These characters cannot be used in ObjectPaths, which includes both the package path and part after the first . */
    // #define INVALID_OBJECTPATH_CHARACTERS	TEXT("\"' ,|&!~\n\r\t@#(){}[]=;^%$`")
    const kInvalidObjectPathCharacters = /[^" ,|&!~\n\r\t@#(){}[\]=;^%$`]+/; // allow ' because we strip it out later
    const assetPaths = selections.map(selection => { 
        // if the selection is empty, use the string under the cursor
        const range = !selection.isEmpty ? selection :
            document.getWordRangeAtPosition(selection.active, kInvalidObjectPathCharacters);
        let assetPath = document.getText(range);

        // extract the asset path from a typed reference, e.g. "Texture2D'/Game/MyTexture.MyTexture'"
        const typeSeparator = assetPath.indexOf("'");
        if (typeSeparator >= 0) {
            assetPath = assetPath.substring(typeSeparator + 1, assetPath.length - 1);
        }

        return assetPath;
    });    

    return assetPaths;
}

export async function ue4OpenEditorsForAssets(assetPaths?: string[]): Promise<void> {
    if (!assetPaths) {
        assetPaths = ue4GetSelectedAssetPaths();
    }

    if (assetPaths && assetPaths.length > 0) {
        ue4RemoteObjectCall(
            "/Script/TdpEditor.Default__TdpAssetLibrary",
            "OpenEditorsForAssets", 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            { "AssetsToOpen": assetPaths });
    }
}

export async function ue4RemoteObjectCall(objectPath: string, functionName: string, parameters: unknown): Promise<string> {
    const body = JSON.stringify({
        "objectPath" : objectPath,
        "functionName": functionName,
        "parameters": parameters
    });

    const options = {
        hostname: 'localhost',
        port: 30010,
        path: '/remote/object/call',
        method: 'PUT',
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': 'application/json',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Length': body.length
        }
    };

    let responseData = '';
    const req = http.request(options, res => {
        fracasOut.appendLine(`${functionName} statusCode: ${res.statusCode}`);
        res.on('data', function(d) { responseData = d.toString(); });
    });

    req.on('error', error => { vscode.window.showErrorMessage(error.message); });

    req.write(body);
    req.end();

    return responseData;
}