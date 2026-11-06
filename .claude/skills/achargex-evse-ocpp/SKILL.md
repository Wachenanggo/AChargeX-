---
name: achargex-evse-ocpp
description: Work on the AChargeX CSMS / OCPP service — OCPP 1.6J and 2.0.1 adapters, charger lifecycle, connector states, sessions, remote commands, meter values, simulator isolation. Use for any change under apps/ocpp or packages/shared/src/ocpp-rpc.ts.
---

# AChargeX EVSE / OCPP

## Layout
- `packages/shared/src/ocpp-rpc.ts` — runtime-agnostic OCPP-J framing ([2,id,action,payload] / [3,id,payload] / [4,id,code,desc,details]), uniqueId correlation, timeouts, NotImplemented for unknown actions, subprotocol negotiation.
- `apps/ocpp/src/domain.ts` — version-neutral `ChargerSink` (inbound) and `ChargerCommands` (outbound).
- `ocpp/v16.ts`, `ocpp/v201.ts` — adapters. 1.6: StatusNotification/StartTransaction/MeterValues/StopTransaction, CSMS assigns integer transactionId. 2.0.1: TransactionEvent (Started/Updated/Ended), charger assigns transactionId, remoteStartId correlates RequestStartTransaction.
- `csms.ts` — sessions, payment hold/capture/void, auto-stop at limit, commands, stale-heartbeat sweep.
- `app.ts` — WS upgrade: path `/ocpp/<identity>`, subprotocol negotiation, Basic auth (Security Profile 1), simulator secret.
- `sim/simulator.ts` — simulated charge points over real sockets (both versions).

## Invariants (tests enforce most of these — keep them green)
- Command results are reported only from the charger's CALLRESULT/CALLERROR (or `timeout`/`offline`).
- A session is `charging` only after the charger starts the transaction; cost = metered Wh × tariff; capture ≤ hold.
- `SIM-` identities need the simulator secret header; real identities can't send it; sessions never cross simulated/real.
- Unknown vendor fields are tolerated; unknown statuses become `Unknown` + an info alert; unsupported actions → NotImplemented.
- Never represent a charger as operational until it has connected (BootNotification) AND been commissioned on an approved station.

## Adding a message
1. Add parsing in the adapter → call a `ChargerSink` method (extend `domain.ts` if needed).
2. Handle it in `csms.ts` `sinkFor()`.
3. Teach the simulator to emit/answer it.
4. Add an end-to-end case in `apps/ocpp/src/csms.test.ts` for BOTH versions where applicable. Run `npm test`.
