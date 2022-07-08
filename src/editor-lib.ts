import * as path from 'path';
import * as vscode from 'vscode';
import { 
    fracasOut,
    getProjectFolder
} from './config';
import { lastMatch } from './regular-expressions';

export async function findProjectFiles(pattern: string = '**/*.frc'): Promise<vscode.Uri[]> {
    const files = vscode.workspace.findFiles(new vscode.RelativePattern(getProjectFolder(), pattern));
    return files;
}

/**
 * Search many documents to find matches for a regular expression.
 * @param searchRx The regular expression used to search files
 * @param token Cancellation token that can be used to abort the search.
 * @param include The file name pattern to use for the search. Defaults to all 
 * fracas docs in the project directory.
 * @returns The collection of text entries that match `searchRx` in the documents.
 */
export async function findTextInFiles(
    searchRx: string,
    token?: vscode.CancellationToken,
    include: vscode.GlobPattern = new vscode.RelativePattern(getProjectFolder(), '**/*.frc')
): Promise<vscode.TextSearchMatch[]> {
    fracasOut.appendLine(`${include}: ${searchRx}`);
    const results: vscode.TextSearchMatch[] = [];
    try {
        await vscode.workspace.findTextInFiles(
            { pattern: searchRx, isRegExp: true },
            {
                include: include,
                previewOptions: {
                    matchLines: 1,
                    charsPerLine: 100
                }
            },
            result => {
                const match = result as vscode.TextSearchMatch;
                if (match) {
                    results.push(match);
                }
            },
            token);
    } catch (error) {
        vscode.window.showErrorMessage("Text search failed: " + error);
    }
    return results;
}

/**
 * Find the word at the cursor position in the given document.
 * @param document The document in which to find a word, or undefined to use the active editor document.
 * @param where The cursor position or range at which to find a word, or undefined to use the active editor selection.
 * @param stripTrailingColon true to strip trailing colons from the symbol
 * @returns The symbol at the given position in the given document.
 */
export function getSelectedSymbol(
    document?: vscode.TextDocument, where?: vscode.Range | vscode.Position, stripTrailingColon = false
): string {
    const resolvedSymbol = resolveSymbol(document, where);
    if (resolvedSymbol) {
        let word = resolvedSymbol.document.getText(resolvedSymbol.range);
        if (stripTrailingColon && word.endsWith(':')) { // strip trailing ':' for fracas constructors (hacky)
            word = word.substring(0, word.length - 1);
        }
        return word;
    } else {
        fracasOut.appendLine("Tried to search for definition, but no text was highlighted nor could a phrase be determined from cursor position");
        return "";
    }
}

/**
 * Given a position or a range, ensure that the value is a range.
 * @param where A position or range to convert to a range.
 * @returns if where is a range, return he given range. If where is a position,
 * return an empty range located at the given position.
 */
export function resolveRange(where: vscode.Range | vscode.Position): vscode.Range {
    const range: vscode.Range = where as vscode.Range;
    return range?.start ? range : new vscode.Range(where as vscode.Position, where as vscode.Position);
}

/**
 * Find the range of the word under the cursor at the `where` position in the given document.
 * If no document or position is given, use the selection in the active text editor.
 * @param document (optional) the document containing the text. If not given, use the active editor's document.
 * @param where (optional) the position or range within the document at which
 * to find a symbol. If not given, the cursor position is used.
 * @returns The symbol at the `where` location, or undefined if no document was given
 * and there is no active editor, or the active editor has no word at the given position.
 */
export function resolveSymbol(
    document?: vscode.TextDocument, where?: vscode.Range | vscode.Position
): { document: vscode.TextDocument, range: vscode.Range } | undefined {
    // default to current editor selection if no document or range is provided
    const activeEditor = vscode.window.activeTextEditor;
    document = document ?? activeEditor?.document;
    where = where ?? activeEditor?.selection; // use the given value or the active editor selection
    let range: vscode.Range | undefined = where ? resolveRange(where) : undefined;

    if (document && range) {
        // default to the word under the cursor if no range is provided
        if (range?.isEmpty) {
            const wordRange = document.getWordRangeAtPosition(
                range?.start ?? where as vscode.Position, /[#:\w\-+*.>/]+/);
            if (wordRange) {
                range = wordRange;
            }
        }

        // where is now a range, so get the text from it
        if (range) {
            return { document, range };
        }
    }

    return undefined;
}

/**
 * Resolve a selection to ensure that it exists. If undefined data is passed, use the selection from the active editor.
 * @param referencingDocument The document within which text is selected, or undefined to use the active editor document.
 * @param documentSelection The selection range to use, or undefined to use the current selection in the active editor.
 * @returns the resolved, non-null document and selection
 */
export function resolveSelection(
    referencingDocument?: vscode.TextDocument,
    documentSelection?: vscode.Range,
): { document: vscode.TextDocument | undefined, selection: vscode.Range | undefined } {
    const activeEditor = vscode.window.activeTextEditor;
    return { 
        document: referencingDocument ?? activeEditor?.document,
        selection: documentSelection ?? activeEditor?.selection
    };
}

/**
 * Resolve a position to ensure that it exists. If undefined data is passed, use the cursor from the active editor.
 * @param referencingDocument The document within which to find a position, or undefined to use the active editor document.
 * @param documentPosition The cursor position to use, or undefined to use the current anchor in the active editor.
 * @returns the resolved, non-null document and position
 */
 export function resolvePosition(
    referencingDocument?: vscode.TextDocument,
    documentPosition?: vscode.Position,
): { document: vscode.TextDocument | undefined, position: vscode.Position | undefined } {
    const activeEditor = vscode.window.activeTextEditor;
    return { 
        document: referencingDocument ?? activeEditor?.document,
        position: documentPosition ?? activeEditor?.selection?.active
    };
}

/**
 * Invoke a lambda function on the active editor.
 * @param func A lambda to apply to the active editor
 */
 export function withEditor(func: (vscodeEditor: vscode.TextEditor) => void): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        func(editor);
    } else {
        vscode.window.showErrorMessage("A file must be opened before you can do that");
    }
}

/**
 * Invoke a function passing the filename of the active editor document
 * @param func A lambda to apply to the active editor document filename.
 */
export function withFilePath(func: (filePath: string) => void): void {
    withEditor((editor: vscode.TextEditor) => func(path.resolve(editor.document.fileName)));
}

/**
 * Resolve a range or array of ranges to a single range.
 * @param ranges The range, or an array of ranges.
 * @returns The given range, or the first element of the array if it is an array.
 */
export function getRange(ranges: (vscode.Range | vscode.Range[])): vscode.Range {
    return Array.isArray(ranges) ? ranges[0] : ranges;
}

/**
 * 
 * @param text The text to split into lines
 * @param newline The newline character sequence used to split the text into lines
 * @returns An array of 
 */
function _computeTextLineStarts(text: string, newline: string): Uint32Array {
    const textLines = text.split(newline);
    const textLineStarts = new Uint32Array(textLines.length);

    // compute the offsets of each line start within the text block
    let textOffset = 0;
    for (let index = 0; index < textLines.length; index++) {
        textLineStarts[index] = textOffset;
        textOffset += textLines[index].length + newline.length;
    }

    return textLineStarts;
}

/**
 * Find the first occurrence of a regex match within a document starting at the given position.
 * @param uri The document to search
 * @param pos The position at which to begin searching
 * @param searchRx The regular expression to search for
 * @returns The position of the first match, or undefined if no match was found.
 */
export async function searchForward(uri: vscode.Uri, pos: vscode.Position, searchRx: RegExp
): Promise<{ line: vscode.TextLine, match: RegExpExecArray } | undefined> {
    const doc = await vscode.workspace.openTextDocument(uri);
    let lineNo = pos.line;
    let line = doc.lineAt(lineNo);
    let lineText = line.text.substring(pos.character);
    while (lineNo < doc.lineCount) {
        const match = searchRx.exec(lineText);
        if (match) {
            return { line, match };
        }

        line = doc.lineAt(lineNo);
        lineText = line.text;
        lineNo += 1;
    }
    return undefined;
}

/**
 * Search each line of a document in reverse from the given position for the first occurrence 
 * of a regex match.
 * @param uri The document to search
 * @param pos The position before which to begin searching
 * @param searchRx The regular expression to search for
 * @returns The position of the first match preceding pos, or undefined if no match was found.
 */
export async function searchBackward(uri: vscode.Uri, pos: vscode.Position, searchRx: RegExp
): Promise<{ line: vscode.TextLine, match: RegExpExecArray } | undefined> {
    const doc = await vscode.workspace.openTextDocument(uri);
    let lineNo = pos.line;
    let line = doc.lineAt(lineNo);
    let lineText = line.text.substring(0, pos.character);
    while (lineNo >= 0) {
        const match = lastMatch(searchRx, lineText);
        if (match) {
            return { line, match };
        }

        line = doc.lineAt(lineNo);
        lineText = line.text;
        lineNo -= 1;
    }
    return undefined;
}

/**
 * Translate ranges from a block of text into equivalent ranges offset within a document.
 * @param text A block of text referenced by the textRanges array.
 * @param textRanges An array of ranges within the text.
 * @param newline The newline character to use when splitting the text.
 * @param document The document for which to compute the ranges.
 * @param documentPos The position within the document at which the text block.
 * @returns ranges within the document corresponding to the textRanges array.
 */
 export function textRangesToDocumentRanges(
    text: string,
    textRanges: vscode.Range[],
    newline: string,
    document: vscode.TextDocument, 
    documentPos: vscode.Position)
: vscode.Range[] {
    const textLineStarts = _computeTextLineStarts(text, newline);

    const docPosOffset = document.offsetAt(documentPos);
    const documentRanges = textRanges.map(textRange => {
        // convert the text range to offsets within the text block
        const textStartOffset = textLineStarts[textRange.start.line] + textRange.start.character;
        const textEndOffset = textLineStarts[textRange.end.line] + textRange.end.character;
        
        // translate the text offsets to document positions
        const docStart = document.positionAt(docPosOffset + textStartOffset);
        const docEnd = document.positionAt(docPosOffset + textEndOffset);
        return new vscode.Range(docStart, docEnd);
    });

    return documentRanges;
}

/**
 * Convert a diff to a list of vscode.TextEdits
 * https://en.wikipedia.org/wiki/Diff#Unified_format
 * @param diff The diff to convert into TextEdits.
 * @param eol The line ending to use when converting the diff.
 * @returns 
 */
export function diffToTextEdits(diff: string, newline = "\r\n"
): vscode.TextEdit[] {
    const diffLines = diff.split(/\r*\n/g);
    const edits: vscode.TextEdit[] = [];
    let diffIdx = 0;
    // scan to the first hunk
    while (!diffLines[diffIdx].startsWith("@@") && diffIdx < diffLines.length) {
        ++diffIdx;
    }
    // process hunks
    while (diffIdx < diffLines.length) {
        // the hunk header is of the form @@ -<before_start>,<before_length> +<after_start>,<after_length> @@
        // For example, @@ -6,15 +8,20 @@ describes a hunk at line 6 in the original text that is 15 lines long
        const hunk = /@@\s+-(\d+),(\d+)\s\+(\d+),(\d+)\s+@@/.exec(diffLines[diffIdx]);
        diffIdx += 1;

        if (hunk) {
            const newText: string[] = [];

            // process hunk lines
            let endCharacter = 0; // tracks the original end position of the line within the source document
            while (diffIdx < diffLines.length) {
                const line = diffLines[diffIdx];
                const op = line.length > 0 ? line[0] : "";
                if (op === "+" /* addition */) {
                    newText.push(line.substring(1));
                } else if (op === " " /* no change */) {
                    newText.push(line.substring(1));
                    endCharacter = line.length - 1;
                } else if (op === "-" /* deletion */) {
                    endCharacter = line.length - 1;
                } else if (op === "@" /* new hunk */) {
                    break;
                } // else it's a deletion, ignore it
                ++diffIdx;
            }

            // convert the hunk text to a TextEdit
            const startLine = parseInt(hunk[1]) - 1; // from hunk header (convert to zero-based)
            const endLine = startLine + parseInt(hunk[2]) - 1; // from hunk header
            const editRange = new vscode.Range(startLine, 0, endLine, endCharacter);
            edits.push(new vscode.TextEdit(editRange, newText.join(newline)));
        } else {
            ++diffIdx;
        }
    }

    return edits;
}

