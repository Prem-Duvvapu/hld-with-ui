import type { IdempotencyInput, IdempotencyState } from "../../api/types";
import {
  callerObservation,
  lookupLabels,
  phaseLabels,
  resolutionLabels,
} from "./idempotencyLabels";
type State = IdempotencyState;
export function IdempotencyStateView({
  state,
  input,
  selectedCallId,
}: {
  state: State;
  input: IdempotencyInput;
  selectedCallId?: string;
}) {
  return (
    <section
      className="idem-snapshot"
      aria-label="Selected idempotency snapshot"
    >
      <section aria-label="Call state and private work">
        <h4>1 · What each call knows</h4>
        <p className="idem-muted">
          A server receipt can exist before its caller receives anything.
          Prepared units are private; only the ledger below contains published
          effects.
        </p>
        <div className="idem-call-cards">
          {state.calls.map((call) => {
            const configured = input.calls.find((item) => item.id === call.id)!;
            return (
              <article
                className="idem-state-card"
                key={call.id}
                aria-label={`Call ${call.id}`}
                data-selected={call.id === selectedCallId ? "true" : undefined}
              >
                <h5>
                  {call.id} · {phaseLabels[call.phase]}
                </h5>
                <p className="idem-identity">
                  Tenant {configured.tenantId} · key {configured.key} · intended
                  operation {configured.operationId} · {configured.units} units
                </p>
                <div className="idem-state-pair">
                  <p>
                    <span>Private prepared units</span>
                    <strong>{call.pendingUnits}</strong>
                  </p>
                  <p>
                    <span>Caller observation</span>
                    <strong>{callerObservation(call)}</strong>
                  </p>
                </div>
                {call.phase === "CRASHED" && (
                  <p className="idem-muted">
                    Lookup and resolution fields are retained history. This
                    handler has stopped.
                  </p>
                )}
                <dl>
                  <div>
                    <dt>Lookup observation</dt>
                    <dd>
                      {call.lookupDisposition
                        ? lookupLabels[call.lookupDisposition]
                        : "Not looked up"}
                    </dd>
                  </div>
                  <div>
                    <dt>Server resolution</dt>
                    <dd>
                      {call.resolution
                        ? resolutionLabels[call.resolution]
                        : "Not resolved"}
                    </dd>
                  </div>
                  <div>
                    <dt>Record observed at lookup</dt>
                    <dd>{call.observedRecordId ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Record used at resolution</dt>
                    <dd>{call.resolvedRecordId ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>This call's public effect</dt>
                    <dd>{call.publishedEffectId ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Server-side receipt</dt>
                    <dd>
                      {call.receipt
                        ? `${call.receipt.effectId} · ${call.receipt.units} units`
                        : "None cached"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
      <section aria-label="Public effect ledger">
        <h4>2 · What has actually been published</h4>
        <dl className="idem-snapshot-totals">
          <div>
            <dt>Published units</dt>
            <dd>{state.publishedUnits}</dd>
          </div>
        </dl>
        {state.effects.length ? (
          <ol className="idem-history">
            {state.effects.map((effect) => (
              <li
                className="idem-state-card"
                key={effect.id}
                aria-label={`Effect ${effect.id}`}
                data-selected={
                  effect.callId === selectedCallId ? "true" : undefined
                }
              >
                <h5>
                  {effect.id} · {effect.units} units
                </h5>
                <p>
                  Call {effect.callId} · tenant {effect.tenantId} · operation{" "}
                  {effect.operationId} · published at {effect.publishedAtMs} ms
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="idem-empty-row">No effects have been published.</p>
        )}
        <p className="idem-muted">
          Published effects remain in this model after response loss, handler
          crash or key expiry. This rule does not prove physical durability.
        </p>
      </section>
      <section aria-label="Retained key history">
        <h4>3 · Which receipts can a new lookup find?</h4>
        <dl className="idem-snapshot-totals">
          <div>
            <dt>Active retained keys</dt>
            <dd>{state.activeKeyCount}</dd>
          </div>
          <div>
            <dt>Expired historical keys</dt>
            <dd>{state.expiredKeyCount}</dd>
          </div>
        </dl>
        {state.keyRecords.length ? (
          <ol className="idem-history">
            {state.keyRecords.map((record) => (
              <li
                className="idem-state-card"
                key={record.id}
                aria-label={`Key record ${record.id}`}
                data-status={record.status}
              >
                <h5>
                  {record.id} ·{" "}
                  {record.status === "ACTIVE" ? "Active" : "Expired history"}
                </h5>
                <dl>
                  <div>
                    <dt>Lookup scope</dt>
                    <dd>
                      ({record.tenantId}, {record.key})
                    </dd>
                  </div>
                  <div>
                    <dt>Retained payload</dt>
                    <dd>{record.units} units</dd>
                  </div>
                  <div>
                    <dt>Original receipt</dt>
                    <dd>
                      {record.receipt.effectId} · {record.receipt.units} units
                    </dd>
                  </div>
                  <div>
                    <dt>Stored at</dt>
                    <dd>{record.createdAtMs} ms</dd>
                  </div>
                  <div>
                    <dt>Expires at</dt>
                    <dd>{record.expiresAtMs} ms</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="idem-empty-row">No retained key records.</p>
        )}
        <p className="idem-muted">
          Expired rows remain as evidence, but a new lookup cannot use them. A
          receipt already cached by a call can still finish after its record
          expires.
        </p>
      </section>
    </section>
  );
}
