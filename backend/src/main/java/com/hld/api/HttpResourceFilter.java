package com.hld.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Bound API POST bodies before parsing; admit synchronous runs across all simulation models. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public final class HttpResourceFilter extends OncePerRequestFilter {
    private final HttpExecutionLimits limits;
    private final ObjectMapper mapper;
    private final Semaphore permits;

    public HttpResourceFilter(HttpExecutionLimits limits, ObjectMapper mapper) {
        this.limits = limits;
        this.mapper = mapper;
        this.permits = new Semaphore(limits.maxConcurrentSimulations());
    }

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !request.getServletPath().startsWith("/api/v1/");
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        boolean run = request.getServletPath().matches("/api/v1/simulations/[^/]+/runs");
        if (run && !permits.tryAcquire()) {
            response.setHeader("Retry-After", "1");
            problem(response, HttpStatus.SERVICE_UNAVAILABLE, "simulation_busy",
                    "The simulator is busy. Keep your inputs and try again in a moment.");
            return;
        }
        try {
            int max = limits.maxRequestBytes();
            if (request.getContentLengthLong() > max) {
                tooLarge(response);
                return;
            }
            // Read at most cap + 1, also for chunked/unknown-length bodies and trailing whitespace.
            byte[] body = request.getInputStream().readNBytes(max + 1);
            if (body.length > max) {
                tooLarge(response);
                return;
            }
            chain.doFilter(new BufferedRequest(request, body), response);
        } finally {
            // Covers parse/validation/model/serialization failures and response-write disconnects.
            if (run) permits.release();
        }
    }

    private void tooLarge(HttpServletResponse response) throws IOException {
        problem(response, HttpStatus.PAYLOAD_TOO_LARGE, "request_too_large",
                "This workload is too large to send. Reduce it and try again.");
    }

    private void problem(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), ApiError.of(code, message, Map.of()));
    }

    private static final class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private BufferedRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override public ServletInputStream getInputStream() {
            var stream = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return stream.read(); }
                @Override public int read(byte[] bytes, int offset, int length) {
                    return stream.read(bytes, offset, length);
                }
                @Override public boolean isFinished() { return stream.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("This API uses synchronous request bodies.");
                }
            };
        }

        @Override public BufferedReader getReader() {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }
}
