package com.hld.transactions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ReservationValidationTest {
    private final ReservationAnalyzer analyzer = new ReservationAnalyzer();

    private static ReservationInput input(Integer units, List<Reservation> actors, List<Step> steps) {
        return new ReservationInput("1.0", "1.0.0", Strategy.STALE_READ_WRITE, units, actors, steps);
    }

    private static List<Reservation> actors() {
        return List.of(new Reservation("a", 1), new Reservation("b", 1));
    }

    private static List<Step> steps() {
        return List.of(new Step("read-a", "a", Action.READ), new Step("read-b", "b", Action.READ),
                new Step("attempt-a", "a", Action.ATTEMPT_RESERVE),
                new Step("attempt-b", "b", Action.ATTEMPT_RESERVE));
    }

    static Stream<Arguments> invalidEnvelopes() {
        return Stream.of(
                Arguments.of("null input", null),
                Arguments.of("missing schema version", new ReservationInput(null, "1.0.0", Strategy.STALE_READ_WRITE, 1, actors(), steps())),
                Arguments.of("unsupported schema version", new ReservationInput("2.0", "1.0.0", Strategy.STALE_READ_WRITE, 1, actors(), steps())),
                Arguments.of("missing model version", new ReservationInput("1.0", null, Strategy.STALE_READ_WRITE, 1, actors(), steps())),
                Arguments.of("unsupported model version", new ReservationInput("1.0", "2.0.0", Strategy.STALE_READ_WRITE, 1, actors(), steps())),
                Arguments.of("missing strategy", new ReservationInput("1.0", "1.0.0", null, 1, actors(), steps())),
                Arguments.of("missing units", input(null, actors(), steps())),
                Arguments.of("negative units", input(-1, actors(), steps())),
                Arguments.of("too many units", input(21, actors(), steps())),
                Arguments.of("missing reservations", input(1, null, steps())),
                Arguments.of("empty reservations", input(1, List.of(), steps())),
                Arguments.of("too few reservations", input(1, actors().subList(0, 1), steps())),
                Arguments.of("too many reservations", input(1, List.of(new Reservation("a", 1), new Reservation("b", 1), new Reservation("c", 1), new Reservation("d", 1), new Reservation("e", 1)), steps())),
                Arguments.of("null reservation element", input(1, java.util.Arrays.asList(new Reservation("a", 1), null), steps())),
                Arguments.of("missing schedule", input(1, actors(), null)),
                Arguments.of("empty schedule", input(1, actors(), List.of())),
                Arguments.of("null step", input(1, actors(), java.util.Arrays.asList(steps().get(0), steps().get(1), steps().get(2), null))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidEnvelopes")
    void rejectsAbsentUnsupportedAndUnboundedDirectInputs(String description, ReservationInput candidate) {
        assertThatThrownBy(() -> analyzer.run(candidate)).as(description)
                .isInstanceOf(IllegalArgumentException.class)
                .satisfies(error -> assertThat(error.getMessage()).isNotBlank());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"A", "a\n", "a ", " a", "a_b", "1a", "-a", "é", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
    void rejectsMalformedReservationAndStepIdentities(String invalidId) {
        var badActors = List.of(new Reservation(invalidId, 1), new Reservation("b", 1));
        assertThatThrownBy(() -> analyzer.run(input(1, badActors, steps())))
                .isInstanceOf(IllegalArgumentException.class);
        var badSteps = new ArrayList<>(steps());
        badSteps.set(0, new Step(invalidId, "a", Action.READ));
        assertThatThrownBy(() -> analyzer.run(input(1, actors(), badSteps)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @MethodSource("invalidQuantities")
    void doesNotTreatMissingOrOutOfRangeQuantityAsAZeroUnitRequest(Integer quantity) {
        var reservations = List.of(new Reservation("a", quantity), new Reservation("b", 1));
        assertThatThrownBy(() -> analyzer.run(input(1, reservations, steps())))
                .isInstanceOf(IllegalArgumentException.class);
    }

    static Stream<Integer> invalidQuantities() {
        return Stream.of(null, -1, 0, 21, Integer.MAX_VALUE);
    }

    @Test
    void rejectsDuplicateReservationAndStepIdsEvenWhenOtherFieldsDiffer() {
        var duplicateActors = List.of(new Reservation("a", 1), new Reservation("a", 2));
        assertThatThrownBy(() -> analyzer.run(input(2, duplicateActors, steps())))
                .isInstanceOf(IllegalArgumentException.class);
        var duplicateSteps = new ArrayList<>(steps());
        duplicateSteps.set(3, new Step("attempt-a", "b", Action.ATTEMPT_RESERVE));
        assertThatThrownBy(() -> analyzer.run(input(1, actors(), duplicateSteps)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsUnknownMissingAndMalformedReferencesAndMissingActions() {
        for (String reference : new String[] {null, "", "c", "a\n", "A"}) {
            var candidate = new ArrayList<>(steps());
            candidate.set(3, new Step("attempt-b", reference, Action.ATTEMPT_RESERVE));
            assertThatThrownBy(() -> analyzer.run(input(1, actors(), candidate)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        var noAction = new ArrayList<>(steps());
        noAction.set(3, new Step("attempt-b", "b", null));
        assertThatThrownBy(() -> analyzer.run(input(1, actors(), noAction)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void requiresACompleteReadThenAttemptForEachReservationRatherThanJustFourSteps() {
        List<List<Step>> invalid = List.of(
                steps().subList(0, 3),
                List.of(steps().get(0), steps().get(1), steps().get(2), steps().get(3), new Step("extra", "b", Action.READ)),
                List.of(new Step("attempt-a", "a", Action.ATTEMPT_RESERVE), steps().get(1), steps().get(0), steps().get(3)),
                List.of(steps().get(0), steps().get(1), steps().get(2), new Step("again-a", "a", Action.ATTEMPT_RESERVE)),
                List.of(steps().get(0), steps().get(1), new Step("again-a", "a", Action.READ), steps().get(3)),
                List.of(steps().get(0), steps().get(2), new Step("again-a", "a", Action.READ), new Step("again-attempt-a", "a", Action.ATTEMPT_RESERVE)));
        for (List<Step> schedule : invalid)
            assertThatThrownBy(() -> analyzer.run(input(1, actors(), schedule)))
                    .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void lateInvalidStepProducesNoResultAndDoesNotChangeInputsOrContaminateTheNextCall() {
        var valid = input(1, actors(), steps());
        var expected = analyzer.run(valid);
        var badSchedule = new ArrayList<>(steps());
        badSchedule.set(3, new Step("attempt-b", "unknown", Action.ATTEMPT_RESERVE));
        var invalid = input(1, actors(), badSchedule);
        assertThatThrownBy(() -> analyzer.run(invalid)).isInstanceOf(IllegalArgumentException.class);
        assertThat(invalid.reservations()).isEqualTo(actors());
        assertThat(invalid.schedule()).isEqualTo(badSchedule);
        assertThat(analyzer.run(valid)).isEqualTo(expected);
    }
}
