// circomlibjs 没有官方 type, 运行时是 JS, 这里声明成 any.
declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>;
  export const poseidonContract: any;
}

declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: any, wasmPath: string, zkeyPath: string): Promise<{
      proof: any;
      publicSignals: any[];
    }>;
    verify(verificationKey: any, publicSignals: any[], proof: any): Promise<boolean>;
  };
}
