package com.hld.dataaccess;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.HttpExecutionLimits;
import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class DataAccessSerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits limits;
    @Test void baselineExamplesAreActualJavaEvidenceAndOrdinaryVerificationCannotRewriteThem() throws Exception {
        var input = DataAccessPresets.baseline();
        var result = new DataAccessAnalyzer().run(input);
        byte[] inputJson = mapper.writeValueAsBytes(input);
        byte[] resultJson = mapper.writeValueAsBytes(result);
        var inputFile = Path.of("../contracts/examples/data-access-baseline-input.json");
        var resultFile = Path.of("../contracts/examples/data-access-baseline-result.json");
        var generated = Path.of("target/data-access-baseline-result.json");
        Files.createDirectories(generated.getParent());
        Files.write(generated, resultJson);
        if (Boolean.getBoolean("hld.dataaccess.writeExamples")) {
            Files.write(inputFile, inputJson);
            Files.write(resultFile, resultJson);
        }
        assertThat(inputFile).exists(); assertThat(resultFile).exists();
        assertThat(mapper.readTree(Files.readAllBytes(inputFile))).isEqualTo(mapper.readTree(inputJson));
        assertThat(mapper.readTree(Files.readAllBytes(resultFile))).isEqualTo(mapper.readTree(resultJson));
        assertThat(result.totals().indexEntriesExamined()).isEqualTo(2);
        assertThat(result.totals().baseRowsExamined()).isEqualTo(2);
        assertThat(result.outcomes().get(0).returnedIds()).containsExactly("b2", "b3");
        assertThat(mapper.readTree(resultJson).path("outcomes").get(0).has("accepted")).isFalse();
    }
    @Test void maximalIdentifiersCollectionsAndFullScanOutcomesRemainWithinDefaultWireLimits() {
        List<Row> rows = IntStream.range(0, 20).mapToObj(i -> new Row("r" + "x".repeat(29) + String.format("%02d", i),
                "t" + "x".repeat(31), "k" + "x".repeat(29) + String.format("%02d", i), 1_000_000)).toList();
        List<Operation> operations = IntStream.range(0, 10).mapToObj(i -> Operation.allRange("q" + "x".repeat(29) + String.format("%02d", i), 0, 1_000_000, 20)).toList();
        var input = new DataAccessInput("1.0", "1.0.0", IndexOrder.TENANT_CREATED, true, rows, operations);
        var result = new DataAccessAnalyzer().run(input);
        assertThat(rows).allSatisfy(row -> {
            assertThat(row.id()).hasSize(32); assertThat(row.tenant()).hasSize(32); assertThat(row.businessKey()).hasSize(32);
        });
        assertThat(mapper.writeValueAsBytes(input).length).isLessThanOrEqualTo(limits.maxRequestBytes());
        assertThat(mapper.writeValueAsBytes(result).length).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
        assertThat(result.totals().indexEntriesExamined()).isEqualTo(200);
        assertThat(result.totals().baseRowsExamined()).isEqualTo(200);
        assertThat(result.totals().returnedRows()).isEqualTo(200);
        System.out.printf("DATA_ACCESS_SERIALIZATION inputBytes=%d responseBytes=%d operations=%d%n",
                mapper.writeValueAsBytes(input).length, mapper.writeValueAsBytes(result).length, result.outcomes().size());
    }
    @Test void mapperRoundTripPreservesAllVariantFieldsAndOmissionRules() {
        var input = new DataAccessInput("1.0", "1.0.0", IndexOrder.CREATED_TENANT, true, List.of(),
                List.of(Operation.insert("i", new Row("r", "alpha", "k", 0)), Operation.lookup("l", "r"),
                        Operation.allRange("a", 0, 1_000_000, 20), Operation.tenantRange("t", "alpha", 0, 0, 1)));
        byte[] json = mapper.writeValueAsBytes(input);
        assertThat(mapper.readValue(json, DataAccessInput.class)).isEqualTo(input);
        var result = new DataAccessAnalyzer().run(input);
        byte[] resultJson = mapper.writeValueAsBytes(result);
        assertThat(mapper.readValue(resultJson, DataAccessResult.class)).isEqualTo(result);
        var tree = mapper.readTree(resultJson);
        assertThat(tree.has("events")).isFalse(); assertThat(tree.has("seed")).isFalse();
        assertThat(tree.path("outcomes").get(0).path("accepted").asBoolean()).isTrue();
        assertThat(tree.path("outcomes").get(0).has("conflict")).isFalse();
        assertThat(tree.path("outcomes").get(1).has("accepted")).isFalse();
    }
}
