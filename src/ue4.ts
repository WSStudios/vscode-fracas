import * as http from 'http';
import * as vscode from "vscode";

export async function ue4OpenEditorForAsset(assetPath?: string): Promise<void> {
    if (!assetPath) {
        // if no assetPath is provided, use the current selection
        const activeEditor = vscode.window.activeTextEditor;
        const document = activeEditor?.document;
        let wordRange: vscode.Range | undefined = activeEditor?.selection;
        if (!document || !wordRange) {
            return;
        }

        // if the selection is empty, use the string under the cursor
        if (wordRange.isEmpty) {
            wordRange = document.getWordRangeAtPosition(wordRange.start, /[^"]+/);
        }
        assetPath = document.getText(wordRange);

        // extract the asset path from a typed reference, e.g. "Texture2D'/Game/MyTexture.MyTexture'"
        const typeSeparator = assetPath?.indexOf("'");
        if (typeSeparator >= 0) {
            assetPath = assetPath.substring(typeSeparator + 1, assetPath.length - 1);
        }
    }

    if (assetPath) {
        ue4RemoteObjectCall(
            "/Script/TdpEditor.Default__TdpAssetLibrary",
            "OpenEditorForAsset", 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            { "AssetPathName": assetPath });
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
        console.log(`${functionName} statusCode: ${res.statusCode}`);
        res.on('data', function(d) { responseData = d.toString(); });
    });

    req.on('error', error => { vscode.window.showErrorMessage(error.message); });

    req.write(body);
    req.end();

    return responseData;
}