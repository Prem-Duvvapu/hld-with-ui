package com.hld.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Serialize once into bounded UTF-8 bytes, before any result reaches the HTTP response. */
@Component
public final class SimulationResponses {
    private final ObjectMapper mapper;
    private final int maxBytes;

    public SimulationResponses(ObjectMapper mapper, HttpExecutionLimits limits) {
        this.mapper = mapper;
        this.maxBytes = limits.maxSimulationResponseBytes();
    }

    public ResponseEntity<byte[]> json(Object result) {
        var output = new BoundedOutput(maxBytes);
        try {
            mapper.writeValue(output, result);
        } catch (RuntimeException exception) {
            if (output.exceeded) {
                throw new HttpResourceException("result_too_large", HttpStatus.UNPROCESSABLE_CONTENT,
                        "This run produced more data than the app can return. Reduce the workload and try again.");
            }
            throw exception;
        }
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(output.bytes.toByteArray());
    }

    private static final class BoundedOutput extends OutputStream {
        private final int limit;
        private final ByteArrayOutputStream bytes;
        private boolean exceeded;

        private BoundedOutput(int limit) {
            this.limit = limit;
            this.bytes = new ByteArrayOutputStream(Math.min(1024, limit));
        }

        private void check(int count) throws IOException {
            if (count > limit - bytes.size()) {
                exceeded = true;
                throw new IOException("Simulation response byte limit exceeded.");
            }
        }

        @Override public void write(int value) throws IOException {
            check(1);
            bytes.write(value);
        }

        @Override public void write(byte[] data, int offset, int length) throws IOException {
            check(length);
            bytes.write(data, offset, length);
        }
    }
}
