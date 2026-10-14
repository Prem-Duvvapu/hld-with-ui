package com.hld.atomicity;

import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityResult.Allocation;
import com.hld.atomicity.AtomicityResult.CheckSource;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Invariants;
import com.hld.atomicity.AtomicityResult.Kind;
import com.hld.atomicity.AtomicityResult.Metrics;
import com.hld.atomicity.AtomicityResult.Outcome;
import com.hld.atomicity.AtomicityResult.PendingAllocation;
import com.hld.atomicity.AtomicityResult.Phase;
import com.hld.atomicity.AtomicityResult.Reason;
import com.hld.atomicity.AtomicityResult.State;
import com.hld.atomicity.AtomicityResult.TransactionState;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Pure explicit interleaving. All mutable execution details belong to a single call. */
public class AtomicityAnalyzer {
    public static final String SIMULATION_ID = "transaction-atomicity";
    public static final List<String> ASSUMPTIONS = List.of(
            "This is an illustrative local stock/allocation model, not a database or SQL isolation-level emulator.",
            "The complete supplied schedule determines order; no timing, random choice or actual thread scheduling is modeled.",
            "Split writes publish stock and allocation separately; their modeled ABORT has no common rollback boundary.",
            "Staged work is private until one revision-checked publication changes stock and allocation together.",
            "The revision covers visible inventory/allocation mutations only; private preparation and statuses do not advance it.",
            "A coarse revision conflict can reject work even when current stock would still fit its quantity.",
            "Aborting staged work discards only its own unpublished workspace, never another transaction's published effects.",
            "All visible allocations count, including rows written by split transactions that later abort.",
            "Public invariant history includes partial split writes; a repaired final state does not erase an earlier breach.",
            "COMMITTED names local modeled publication, not durable storage, crash recovery, acknowledgement or an external effect.",
            "Retries, idempotency, locks, deadlocks, replicas and multiple-resource transactions are excluded.",
            "Completed means every declared step was evaluated, including rejection, explicit skip or abort outcomes.");

    public AtomicityResult run(AtomicityInput input) {
        AtomicityValidator.validate(input);
        Execution execution = new Execution(input);
        State initial = execution.snapshot();
        List<Outcome> outcomes = new ArrayList<>();
        String firstViolation = null;
        for (var step : input.schedule()) {
            Actor actor = execution.actors.get(step.transactionId());
            Evidence evidence = execution.apply(actor, step);
            State postState = execution.snapshot();
            outcomes.add(new Outcome(outcomes.size() + 1, step.id(), actor.id, step.action(),
                    evidence.kind(), postState, evidence.explanation(), evidence.checkedRemaining(),
                    evidence.checkSource(), evidence.expectedRevision(), evidence.actualRevision(), evidence.reason()));
            if (firstViolation == null && violates(postState.invariants())) firstViolation = step.id();
        }
        State finalState = outcomes.get(outcomes.size() - 1).postState();
        int committed = 0;
        int aborted = 0;
        int conflicted = 0;
        int leaked = 0;
        for (Actor actor : execution.actors.values()) {
            if (actor.phase == Phase.COMMITTED) committed++;
            if (actor.phase == Phase.ABORTED) {
                aborted++;
                if (actor.failureReason == Reason.REVISION_CONFLICT) conflicted++;
                if (execution.hasVisibleEffects(actor)) leaked++;
            }
        }
        Metrics metrics = new Metrics(committed, aborted, conflicted, leaked,
                finalState.remainingUnits(), finalState.allocatedUnits(),
                firstViolation == null ? InvariantStatus.PRESERVED : InvariantStatus.VIOLATED, firstViolation);
        return new AtomicityResult(SIMULATION_ID, AtomicityInput.SCHEMA_VERSION, AtomicityInput.MODEL_VERSION,
                "analysis", "completed", input, initial, outcomes, finalState, metrics, ASSUMPTIONS);
    }

    private static boolean violates(Invariants invariants) {
        return !invariants.remainingNonnegative() || !invariants.allocatedWithinCapacity()
                || !invariants.unitsConserved() || !invariants.abortedEffectsAbsent();
    }

    private static final class Execution {
        private final AtomicityInput input;
        private final Map<String, Actor> actors = new LinkedHashMap<>();
        private final List<Allocation> allocations = new ArrayList<>();
        private int remaining;
        private int revision;

        private Execution(AtomicityInput input) {
            this.input = input;
            remaining = input.initialUnits();
            for (var transaction : input.transactions()) {
                actors.put(transaction.id(), new Actor(transaction.id(), transaction.quantity()));
            }
        }

        private Evidence apply(Actor actor, AtomicityInput.Step step) {
            return switch (step.action()) {
                case BEGIN -> begin(actor);
                case DECREMENT_STOCK -> decrement(actor);
                case RECORD_ALLOCATION -> record(actor, step.id());
                case COMMIT -> commit(actor, step.id());
                case ABORT -> abort(actor);
            };
        }

        private Evidence begin(Actor actor) {
            actor.phase = Phase.OPEN;
            actor.baseRemaining = remaining;
            actor.baseRevision = revision;
            if (input.mode() == Mode.STAGED_VERSION_CHECK) actor.workingRemaining = remaining;
            return Evidence.simple(Kind.TRANSACTION_STARTED, actor.id + " begins with remaining " + remaining
                    + " and visible revision " + revision + ". Capturing this base changes no published stock or allocation.");
        }

        private Evidence decrement(Actor actor) {
            boolean staged = input.mode() == Mode.STAGED_VERSION_CHECK;
            int checked = staged ? actor.workingRemaining : remaining;
            CheckSource source = staged ? CheckSource.WORKING_COPY : CheckSource.CURRENT;
            if (checked < actor.quantity) {
                actor.phase = Phase.BLOCKED;
                actor.failureReason = Reason.INSUFFICIENT_STOCK;
                return new Evidence(Kind.STOCK_REJECTED, actor.id + " checks " + checked
                        + " units in " + (staged ? "its captured working copy" : "current public stock")
                        + " against quantity " + actor.quantity
                        + ". Insufficient stock blocks its work without changing public or private stock.",
                        checked, source, null, null, Reason.INSUFFICIENT_STOCK);
            }
            if (staged) {
                actor.workingRemaining = checked - actor.quantity;
                actor.pendingStockUnits = actor.quantity;
                return new Evidence(Kind.STOCK_STAGED, actor.id + " prepares " + checked + " - " + actor.quantity
                        + " = " + actor.workingRemaining + " remaining units privately. Public stock remains "
                        + remaining + " and visible revision remains " + revision + ".",
                        checked, source, null, null, null);
            }
            remaining = checked - actor.quantity;
            actor.appliedStockUnits = actor.quantity;
            revision++;
            return new Evidence(Kind.STOCK_APPLIED, actor.id + " checks current public stock " + checked
                    + " and immediately writes " + remaining + " remaining units. Visible revision becomes "
                    + revision + "; its allocation has not yet been written, exposing a partial update.",
                    checked, source, null, null, null);
        }

        private Evidence record(Actor actor, String stepId) {
            if (actor.phase == Phase.BLOCKED) {
                return new Evidence(Kind.WORK_SKIPPED, actor.id
                        + " cannot prepare or publish an allocation because its stock command was blocked."
                        + " This declared step is explicitly skipped; public data is unchanged.",
                        null, null, null, null, actor.failureReason);
            }
            if (input.mode() == Mode.STAGED_VERSION_CHECK) {
                actor.pendingAllocation = new PendingAllocation(actor.id, actor.quantity, stepId);
                return Evidence.simple(Kind.ALLOCATION_STAGED, actor.id + " prepares an allocation of "
                        + actor.quantity + " units privately. Neither its pending row nor its pending stock is public yet.");
            }
            allocations.add(new Allocation(actor.id, actor.quantity, stepId, stepId));
            revision++;
            return Evidence.simple(Kind.ALLOCATION_APPLIED, actor.id + " immediately publishes its allocation of "
                    + actor.quantity + " units. Visible revision becomes " + revision
                    + ". This second write may repair conservation but cannot erase the earlier partial prefix.");
        }

        private Evidence commit(Actor actor, String stepId) {
            if (actor.phase == Phase.BLOCKED) return finishAborted(actor, actor.failureReason,
                    "Its earlier insufficient-stock failure prevents commit; no effects are published.", null, null);
            if (input.mode() == Mode.SPLIT_WRITES) {
                actor.phase = Phase.COMMITTED;
                actor.clearPending();
                return Evidence.simple(Kind.TRANSACTION_COMMITTED, actor.id
                        + " finishes COMMITTED. Its two writes were already visible; this command changes status only.");
            }
            int expected = actor.baseRevision;
            int actual = revision;
            if (expected != actual) return finishAborted(actor, Reason.REVISION_CONFLICT,
                    "Expected visible revision " + expected + " but found " + actual
                            + ". Discard only its private proposal; another transaction's published data stays intact.",
                    expected, actual);
            // The modeled indivisible publication has one validated base and no observable half-write.
            remaining = actor.workingRemaining;
            PendingAllocation prepared = actor.pendingAllocation;
            allocations.add(new Allocation(actor.id, actor.quantity, prepared.stepId(), stepId));
            revision++;
            actor.appliedStockUnits = actor.quantity;
            actor.phase = Phase.COMMITTED;
            actor.clearPending();
            return new Evidence(Kind.TRANSACTION_COMMITTED, actor.id + " validates visible revision " + actual
                    + " against its base " + expected + " and publishes stock plus allocation together. Remaining is "
                    + remaining + ", revision becomes " + revision + ", and its private workspace is cleared."
                    + " This local boundary does not promise durability.", null, null, expected, actual, null);
        }

        private Evidence abort(Actor actor) {
            Reason reason = actor.phase == Phase.BLOCKED ? actor.failureReason : Reason.USER_ABORT;
            String explanation = input.mode() == Mode.STAGED_VERSION_CHECK
                    ? "Discard only its unpublished workspace. Published inventory and allocations stay unchanged."
                    : "There is no shared rollback boundary: its already published stock or allocation effects remain.";
            return finishAborted(actor, reason, explanation, null, null);
        }

        private Evidence finishAborted(Actor actor, Reason reason, String explanation,
                Integer expectedRevision, Integer actualRevision) {
            actor.phase = Phase.ABORTED;
            actor.failureReason = reason;
            actor.clearPending();
            return new Evidence(Kind.TRANSACTION_ABORTED, actor.id + " becomes ABORTED (" + reason + "). "
                    + explanation, null, null, expectedRevision, actualRevision, reason);
        }

        private boolean hasVisibleEffects(Actor actor) {
            return actor.appliedStockUnits > 0
                    || allocations.stream().anyMatch(allocation -> allocation.transactionId().equals(actor.id));
        }

        private State snapshot() {
            int allocated = allocations.stream().mapToInt(Allocation::quantity).sum();
            boolean abortedEffectsAbsent = actors.values().stream()
                    .noneMatch(actor -> actor.phase == Phase.ABORTED && hasVisibleEffects(actor));
            List<TransactionState> transactions = actors.values().stream().map(actor -> new TransactionState(
                    actor.id, actor.quantity, actor.phase, actor.appliedStockUnits, actor.pendingStockUnits,
                    actor.baseRemaining, actor.baseRevision, actor.workingRemaining, actor.pendingAllocation,
                    actor.failureReason)).toList();
            return new State(remaining, allocated, revision, transactions, allocations,
                    new Invariants(remaining >= 0, allocated <= input.initialUnits(),
                            remaining + allocated == input.initialUnits(), abortedEffectsAbsent, remaining + allocated));
        }
    }

    private record Evidence(Kind kind, String explanation, Integer checkedRemaining,
            CheckSource checkSource, Integer expectedRevision, Integer actualRevision, Reason reason) {
        private static Evidence simple(Kind kind, String explanation) {
            return new Evidence(kind, explanation, null, null, null, null, null);
        }
    }

    private static final class Actor {
        private final String id;
        private final int quantity;
        private Phase phase = Phase.NOT_STARTED;
        private int appliedStockUnits;
        private int pendingStockUnits;
        private Integer baseRemaining;
        private Integer baseRevision;
        private Integer workingRemaining;
        private PendingAllocation pendingAllocation;
        private Reason failureReason;

        private Actor(String id, int quantity) { this.id = id; this.quantity = quantity; }
        private void clearPending() {
            workingRemaining = null;
            pendingStockUnits = 0;
            pendingAllocation = null;
        }
    }
}
