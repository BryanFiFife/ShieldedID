export declare function proveGE(value: number, min: number, context: any): Promise<{
  commitment: string;
  proof: string;
  publicInputs: string;
}>;

export declare function verifyGE(commitment: string, proof: string, publicInputs: string, min: number): Promise<boolean>;

export declare function proveKYC(value: number, min: number, context: any): Promise<{
  commitment: string;
  proof: string;
  publicInputs: string;
}>;

export declare function verifyKYC(commitment: string, proof: string, publicInputs: string, minLevel: number): Promise<boolean>;
