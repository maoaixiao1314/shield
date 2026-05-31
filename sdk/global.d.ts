// circomlibjs has no official types and is JS at runtime, so it is declared as any here.
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
