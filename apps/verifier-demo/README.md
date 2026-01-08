# Shielded ID Verifier Demo

Reference implementation for integrating SHIELDED ID verification. This demo creates proof requests, shows QR codes, receives proofs via a callback, verifies with the verifier SDK, and keeps a minimal session history.

## Run locally
```bash
cd apps/verifier-demo
npm install
npm run server
npm run dev
```

- Frontend: http://localhost:5174
- Backend: http://localhost:5050

## Environment
- `VITE_VERIFIER_ORIGIN` (default `http://localhost:5174`)
- `VITE_REGISTRY_URL` (default `http://localhost:3000`)
- `VITE_BACKEND_URL` (default `http://localhost:5050`)
- `VERIFIER_ORIGIN` (backend, default `http://localhost:5174`)
- `REGISTRY_URL` (backend, default `http://localhost:3000`)

## Notes
- Only pairwise subject ID, verified timestamp, and claim results are stored.
- Proof requests expire after 5 minutes; QR refreshes every 30 seconds.
- Backend stores requests and sessions in memory for the demo.
