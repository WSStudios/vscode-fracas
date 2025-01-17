import * as assert from "assert";
import path = require("path");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { getProjectDir } from "../../config";
import { getSelectedSymbol } from "../../editor-lib";
import {
    findAllImportDefinitions,
    findCompletions,
    findDefinition,
    findProvidedLocalIdentifiers,
    FracasDefinition,
    FracasDefinitionKind
} from "../../fracas/syntax";
import { SearchKind } from "../../fracas/syntax-regex";
// import * as myExtension from '../../extension';

async function showFracasDocument(
    fileName: string, selection?: vscode.Range
): Promise<{ document: vscode.TextDocument, editor: vscode.TextEditor }> {
    const document = await vscode.workspace.openTextDocument(fileName);
    const editor = await vscode.window.showTextDocument(document, {selection});
    return { document, editor };
}

const testFixtureDir = getProjectDir();
const rewardFrc = path.join(testFixtureDir, 'reward.frc');
const factionsFrc = path.join(testFixtureDir, 'factions.frc');
const collisionDefinesFrc = path.join(testFixtureDir, 'collision-defines.frc');
const abilityFrc = path.join(testFixtureDir, 'ability.frc');
const abilityDataDefinesFrc = path.join(testFixtureDir, 'ability-data-defines.frc');
const abilityActionDefinesFrc = path.join(testFixtureDir, 'ability-action-defines.frc');

const provideSomeFrc = path.join(testFixtureDir, 'provide-some.frc');
const provideAllFrc = path.join(testFixtureDir, 'provide-all.frc');
const provideExceptOutFrc = path.join(testFixtureDir, 'provide-except-out.frc');


// suite("Editor Lib Tests", () => {
//     vscode.window.showInformationMessage("Start editor lib tests.");

//     test("getSelectedSymbol returns word under cursor", async () => {
//         await showFracasDocument(rewardFrc, new vscode.Range(6, 9, 6, 9));
//         const symbol = getSelectedSymbol();
//         assert.strictEqual(symbol, "#:count");
//     });

//     test("getSelectedSymbol returns selection range", async () => {
//         await showFracasDocument(rewardFrc, new vscode.Range(6, 12, 6, 16)); // selection around "ount"
//         const symbol = getSelectedSymbol();
//         assert.strictEqual(symbol, "ount");
//     });
// });

// suite("Import Tests", () => {
//     vscode.window.showInformationMessage("Start import tests.");

//     test("findAllImportDefinitions finds the correct imports", async () => {
//         const { document, editor } = await showFracasDocument(collisionDefinesFrc);
//         const imports = findAllImportDefinitions(document);
//         const importSymbols = imports.map(i => i.symbol);
//         assert.deepStrictEqual(importSymbols, ["fracas/utils/ws-math", "unreal-defines"] );
//     });
// });

// suite("Provide Tests", () => {
//     vscode.window.showInformationMessage("Start import tests.");

//     test("findProvidedLocalIdentifiers finds explicit provide identifiers", async () => {
//         const { document, editor } = await showFracasDocument(provideSomeFrc);
//         const provides = await findProvidedLocalIdentifiers(document);
//         assert.ok(provides.get("not-hidden-enum"));
//         assert.ok(!provides.get("commented-type"));
//         assert.ok(provides.get("*visible-to-all*"));
//     });

//     test("findProvidedLocalIdentifiers finds local identifiers for (all-defined-out)", async () => {
//         const { document, editor } = await showFracasDocument(provideAllFrc);
//         const provides = await findProvidedLocalIdentifiers(document);
//         assert.ok(!provides.get("not-hidden-enum"), "transitively provided `not-hidden-enum` is not a local identifier");
//         assert.ok(provides.get("provided-enum"));
//         assert.ok(provides.get("*goodbye*"));
//         assert.ok(provides.get("provided-type"));
//     });

//     test("findProvidedLocalIdentifiers finds excludes excepted identifiers for (except-out)", async () => {
//         const { document, editor } = await showFracasDocument(provideExceptOutFrc);
//         const provides = await findProvidedLocalIdentifiers(document);
//         assert.ok(!provides.get("exceptional-enum"), "except-out identifier should be excluded");
//         assert.ok(provides.get("not-exceptional-enum"));
//         assert.ok(provides.get("*not-special*"));
//     });

// });

suite("Find Definition Tests", () => {
    vscode.window.showInformationMessage("Start findDefinition tests.");

    test("findDefinition resolves a partial match", async () => {
        const { document } = await showFracasDocument(abilityActionDefinesFrc);
        // cursor within "action-block" of "(define-variant action-block"        
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(3, 25), undefined, SearchKind.partialMatch);
        assert.strictEqual(defs.length, 1, "findDefinition should resolve partial matches");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.variant, "type definition kind is not 'key'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Struct, "type completion kind is not 'Variable'");
        assert.strictEqual(defs[0].symbol, "action-block", "symbol is not 'action-block'");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(3, 16, 3, 28), "location of action-block is not correct");
    });

    test("findDefinition ignores a forward declaration", async () => {
        const { document } = await showFracasDocument(abilityActionDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(114, 14)); // cursor within "((data damage-data)))"
        assert.strictEqual(defs.length, 0, "findDefinition should ignore a forward declaration");
    });

    test("findDefinition resolves a define-key", async () => {
        const { document } = await showFracasDocument(abilityDataDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(398, 35)); // cursor within "*key-none*"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.key, "type definition kind is not 'key'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Variable, "type completion kind is not 'Variable'");
        assert.strictEqual(defs[0].symbol, "*key-none*", "symbol is not '*key-none*'");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(1, 12, 1, 22), "location of key is not correct");
    });

    test("findDefinition resolves a define-game-data with a newline", async () => {
        const { document } = await showFracasDocument(abilityDataDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(426, 29)); // cursor within "*def-with-a-newline*"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.gameData, "type definition kind is not 'gameData'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Module, "type completion kind is not 'Module'");
        assert.strictEqual(defs[0].symbol, "*def-with-a-newline*", "symbol is not '*def-with-a-newline*'");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(117, 17, 118, 21), "location of define-game-data is not correct");
    });

    test("findDefinition resolves a named parameter", async () => {
        const { document } = await showFracasDocument(abilityFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(42, 38)); // cursor within "#:net-playback-mode"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.keyword, "type definition kind is not 'keyword'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Keyword, "type completion kind is not 'Keyword'");
        assert.strictEqual(defs[0].symbol, "net-playback-mode");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(26, 32, 26, 49), "location of named parameter is not correct");
    });

    test("findDefinition resolves a #:contextual-actions (JIRA-12970)", async () => {
        const { document } = await showFracasDocument(abilityFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(55, 20)); // cursor within "#:contextual-actions"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.keyword, "type definition kind is not 'keyword'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Keyword, "type completion kind is not 'Keyword'");
        assert.strictEqual(defs[0].symbol, "contextual-actions");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(60, 11, 60, 29), "location of named parameter is not correct");
    });

    test("findDefinition resolves an enum member at scope depth 2", async () => {
        const { document } = await showFracasDocument(abilityDataDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(228,64)); // cursor within "on-ability-action" ability-commit-mode
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.enumMember, "type definition kind is not 'enumMember'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.EnumMember, "type completion kind is not 'EnumMember'");
        assert.strictEqual(defs[0].symbol, "on-ability-action");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityDataDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(223, 4, 223, 21), "location of enum member is not correct");
    });

    test("findDefinition resolves an enum member at scope depth 1", async () => {
        const { document } = await showFracasDocument(factionsFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(79, 46)); // cursor within "friendly" faction-stance
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.enumMember, "type definition kind is not 'enumMember'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.EnumMember, "type completion kind is not 'EnumMember'");
        assert.strictEqual(defs[0].symbol, "friendly");
        assert.strictEqual(defs[0].location.uri.fsPath, factionsFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(25, 3, 25, 11), "location of enum member is not correct");
    });

    test("findDefinition resolves an enum definition", async () => {
        const { document } = await showFracasDocument(factionsFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(59, 63)); // cursor within "faction-type"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.enum, "type definition kind is not 'enum'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Enum, "type completion kind is not 'Enum'");
        assert.strictEqual(defs[0].symbol, "faction-type");
        assert.strictEqual(defs[0].location.uri.fsPath, factionsFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(8, 13, 8, 25), "location of enum type is not correct");
    });

    test("findDefinition resolves a mask definition", async () => {
        const { document } = await showFracasDocument(collisionDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(67, 54)); // cursor within "phys-collision-channel"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.mask, "type definition kind is not 'mask'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Enum, "type completion kind is not 'Enum'");
        assert.strictEqual(defs[0].symbol, "phys-collision-channel");
        assert.strictEqual(defs[0].location.uri.fsPath, collisionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(38, 13, 38, 35), "location of mask type is not correct");
    });

    test("findDefinition resolves a mask member at scope depth 1", async () => {
        const { document } = await showFracasDocument(collisionDefinesFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(74, 79)); // cursor within "destructible"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.maskMember, "type definition kind is not 'maskMember'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.EnumMember, "type completion kind is not 'EnumMember'");
        assert.strictEqual(defs[0].symbol, "destructible");
        assert.strictEqual(defs[0].location.uri.fsPath, collisionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(47, 3, 47, 15), "location of mask member is not correct");
    });

    test("findDefinition resolves a field def", async () => {
        const { document } = await showFracasDocument(rewardFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(6, 9)); // selection at "#:count");
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.keyword, "field definition kind is not 'field'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Keyword, "field completion kind is not 'Keyword'");
        assert.strictEqual(defs[0].symbol, "count");
        assert.strictEqual(defs[0].location.uri.fsPath, rewardFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(5, 9, 5, 14), "location of definition is not correct");
    });

    test("findDefinition resolves a type def", async () => {
        const { document } = await showFracasDocument(rewardFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(6, 21)); // cursor within "(range-int: ..."
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.type, "type definition kind is not 'type'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Struct, "type completion kind is not 'Struct'");
        assert.strictEqual(defs[0].symbol, "range-int");
        assert.strictEqual(defs[0].location.uri.fsPath, rewardFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(1, 13, 1, 22), "location of definition is not correct");
    });

    test("findDefinition resolves a variant", async () => {
        const { document } = await showFracasDocument(abilityFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(4, 62)); // cursor within "action-block"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.variant, "type definition kind is not 'variant'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Struct, "type completion kind is not 'Struct'");
        assert.strictEqual(defs[0].symbol, "action-block");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(3, 16, 3, 28), "location of definition is not correct");
    });

    test("findDefinition resolves a variant option", async () => {
        const { document } = await showFracasDocument(abilityFrc);
        const defs: FracasDefinition[] = await findDefinition(document, new vscode.Position(4, 12)); // cursor within "action-block-targeted:"
        assert.strictEqual(defs.length, 1, "single definition not found");
        assert.strictEqual(defs[0].kind, FracasDefinitionKind.variantOption, "type definition kind is not 'variantOption'");
        assert.strictEqual(defs[0].completionKind, vscode.CompletionItemKind.Struct, "type completion kind is not 'Struct'");
        assert.strictEqual(defs[0].symbol, "action-block-targeted");
        assert.strictEqual(defs[0].location.uri.fsPath, abilityActionDefinesFrc);
        assert.deepStrictEqual(defs[0].location.range, new vscode.Range(5, 3, 5, 11), "location of definition is not correct");
    });
});

suite("Auto-Completion Tests", () => {
    vscode.window.showInformationMessage("Start findDefinition tests.");

    test("findCompletions resolves all mask members for empty text", async () => {
        const { document } = await showFracasDocument(collisionDefinesFrc);
        const completions = await findCompletions(document, new vscode.Position(69, 57)); // cursor within empty parens "(mask phys-collision-channel )"
        assert.ok(completions, "findCompletions for (mask phys-collision-channel... returned null");
        const expectedMembers = ["world-static", "world-dynamic", "pawn", "visibility", "camera", "physics-body", "vehicle", "destructible", "engine-1", "engine-2", "engine-3", "engine-4", "engine-5", "engine-6", "player", "trigger", "actionable", "weapon", "projectile", "pushable", "invisible-wall", "pet"];
        for (const member of expectedMembers) {
            assert.ok(completions.find(c => c.label === member), `Expected completion for ${member}`);
        }
        assert.strictEqual(completions.length, expectedMembers.length, "completion count incorrect");
        for (const completion of completions) {
            assert.strictEqual(completion.kind, vscode.CompletionItemKind.EnumMember, "completion kind is not 'EnumMember'");
        }
        const playerCompletion = completions.find(x => x.label === "player");
        assert.strictEqual(playerCompletion?.documentation, "ECC_GameTraceChannel1", "completion documentation for (mask phys-collision-channel player) is not 'ECC_GameTraceChannel1'");
    });

    test("findCompletions resolves all mask members", async () => {
        const { document } = await showFracasDocument(collisionDefinesFrc);
        const completions = await findCompletions(document, new vscode.Position(68, 66)); // cursor just after "(mask phys-collision-channel "
        assert.ok(completions, "findCompletions for (mask phys-collision-channel... returned null");
        const expectedMembers = ["world-static", "world-dynamic", "pawn", "visibility", "camera", "physics-body", "vehicle", "destructible", "engine-1", "engine-2", "engine-3", "engine-4", "engine-5", "engine-6", "player", "trigger", "actionable", "weapon", "projectile", "pushable", "invisible-wall", "pet"];
        for (const member of expectedMembers) {
            assert.ok(completions.find(c => c.label === member), `Expected completion for ${member}`);
        }
        assert.strictEqual(completions.length, expectedMembers.length, "completion count incorrect");
        for (const completion of completions) {
            assert.strictEqual(completion.kind, vscode.CompletionItemKind.EnumMember, "completion kind is not 'EnumMember'");
        }
        const playerCompletion = completions.find(x => x.label === "player");
        assert.strictEqual(playerCompletion?.documentation, "ECC_GameTraceChannel1", "completion documentation for (mask phys-collision-channel player) is not 'ECC_GameTraceChannel1'");
    });

    test("findCompletions resolves all enum members", async () => {
        const { document } = await showFracasDocument(abilityDataDefinesFrc);
        const completions = await findCompletions(document, new vscode.Position(228,54)); // cursor just after "(enum ability-commit-mode "
        assert.ok(completions, "findCompletions for enum ability-commit-mode `on-ability`... returned null");
        const expectedMembers = ["on-ability-activation", "on-ability-action", "on-ability-end"];
        for (const member of expectedMembers) {
            assert.ok(completions.find(c => c.label === member), `Expected completion for ${member}`);
        }
        assert.strictEqual(completions.length, expectedMembers.length, "completion count incorrect");
        for (const completion of completions) {
            assert.strictEqual(completion.kind, vscode.CompletionItemKind.EnumMember, "completion kind is not 'EnumMember'");
            assert.strictEqual(completion.documentation, "", "completion documentation is not ''");
        }
    });

    test("findCompletions filters non-matching enum members", async () => {
        const { document } = await showFracasDocument(abilityDataDefinesFrc);
        const completions = await findCompletions(document, new vscode.Position(228,66)); // cursor after "on-ability-a" within ability-commit-mode
        assert.ok(completions, "findCompletions for enum ability-commit-mode `on-ability`... returned null");
        const expectedMembers = ["on-ability-activation", "on-ability-action"];
        for (const member of expectedMembers) {
            assert.ok(completions.find(c => c.label === member), `Expected completion for ${member}`);
        }
        assert.strictEqual(completions.length, expectedMembers.length, "completion count incorrect");
        for (const completion of completions) {
            assert.strictEqual(completion.kind, vscode.CompletionItemKind.EnumMember, "completion kind is not 'EnumMember'");
            assert.strictEqual(completion.documentation, "", "completion documentation is not ''");
        }
    });
});
