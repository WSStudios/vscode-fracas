import * as vscode from 'vscode';

/**
 * Find locations of all regex matches within a document text range.
 * @param searchRx The regular expression to search for, probably with the "global" search flag set.
 * @param document The document to search
 * @param group The index of the regex capture group to extract.
 * @param range The range of document text within which to search for matches. Defaults to the entire document.
 * @returns locations of matches initialized with the document URI and the range of the extracted capture group.
 */
export function matchAll(
    searchRx: RegExp, 
    document: vscode.TextDocument,
    group: number,
    range?: vscode.Range
): vscode.Location[] {
    // find regex match indices in the text
    const text = document.getText(range);
    const rangeOffset = range ? document.offsetAt(range.start) : 0;
    const locations = [];
    // for (let match = exec(searchRx, text); match; match = searchRx.global ? exec(searchRx, text) : null) {
    for (let match of text.matchAll(searchRx)) {
        // convert the match offsets to a document range
        const matchOffset = (match.index ?? 0);
        const [start, end] = match.indices ? match.indices[group] : [matchOffset, matchOffset + match[group].length]
        const groupRange = new vscode.Range(
            document.positionAt(rangeOffset + start), 
            document.positionAt(rangeOffset + end));
        locations.push(new vscode.Location(document.uri, groupRange));
    }

    return locations;
}

export function escapeForRegEx(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the last occurrence of a regex match within a string.
 * @param searchRx The regular expression to search for, probably with the "global" search flag set.
 * @param text The text within which to search for matches.
 * @returns The final matching instance of the regex, or undefined if no match was found. If the regex
 * is not a global search, the first match is returned.
 */
 export function lastMatch(searchRx: RegExp, text: string): RegExpExecArray | null {
    let match = searchRx.exec(text);
    let prevMatch = null;
    if (searchRx.global) {
        while (match) {
            prevMatch = match;
            match = searchRx.exec(text);
        }
    }
    return match ?? prevMatch;
}

/**
 * Find the document location covering a group within a regex match. For example, given 
 * /\((define-type)\s*(cool-stuff))/,
 * calculate the range around "cool-stuff".
 * @param match The expression containing a group to locate.
 * @param group The index of the group within the regex match array.
 * @param document The document in which the match occurs.
 * @param searchPosition The starting position of the text matched against the regex.
 * @returns The location of the capture group within the document.
 */
 export function regexGroupDocumentLocation(
    match: RegExpExecArray,
    group: number,
    document: vscode.TextDocument,
    searchPosition?: vscode.Position
): vscode.Location {
    // calculate the offset of the regex group within the match
    const matchOffset = searchPosition ? document.offsetAt(searchPosition) : 0;
    let groupOffset = matchOffset + match.index;
    for (let i = 1; i < group; ++i) {
        groupOffset += match[i].length;
    }

    // convert the match offsets to a document range
    const groupRange = new vscode.Range(
        document.positionAt(groupOffset), 
        document.positionAt(groupOffset + match[group].length));
    return new vscode.Location(document.uri, groupRange);
}

/**
 * Convert a regex match capture group into a document location. This does the math to convert
 * regex match index and capture group offsets into a document range.
 * indices of the match and into document offsets.
 * @param match The regex match to convert into a document location.
 * @param group The index of the capture group within the match to convert.
 * @param uri The URI of the document in which the match occurs.
 * @param searchPosition The starting position of the text matched against the regex.
 * @returns The location of the capture group within the document.
 */
export async function regexGroupUriLocation(
    match: RegExpExecArray,
    group: number,
    uri: vscode.Uri,
    searchPosition?: vscode.Position
): Promise<vscode.Location> {
    const document = await vscode.workspace.openTextDocument(uri);
    return regexGroupDocumentLocation(match, group, document, searchPosition);
}
