export {};

declare global {
	interface RegExpExecArray {
		indices: RegExpExecIndicesArray;
	}
	interface RegExpMatchArray {
		indices?: RegExpExecIndicesArray;
	}
	interface RegExpExecIndicesArray extends Array<[number, number]> {
		groups?: { [key: string]: [number, number] };
	}	
}