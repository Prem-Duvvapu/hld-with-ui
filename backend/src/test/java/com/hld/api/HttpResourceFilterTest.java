package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

class HttpResourceFilterTest {
    private final HttpResourceFilter filter = new HttpResourceFilter(new HttpExecutionLimits(512, 512, 1), JsonMapper.builder().build());
    private MockHttpServletRequest run() {
        var request = new MockHttpServletRequest("POST", "/api/v1/simulations/cache-aside/runs");
        request.setServletPath(request.getRequestURI());
        request.setContent("{\"seed\":7}".getBytes(StandardCharsets.UTF_8));
        return request;
    }

    @Test void releasesAdmissionAfterReadValidationAndResponseWriteFailures() throws Exception {
        for (Exception problem : new Exception[] {new IOException("disconnected"), new IllegalStateException("failed")}) {
            assertThatThrownBy(() -> filter.doFilter(run(), new MockHttpServletResponse(), (request, response) -> {
                if (problem instanceof IOException io) throw io;
                throw (RuntimeException) problem;
            })).isSameAs(problem);
            var next = new MockHttpServletResponse();
            filter.doFilter(run(), next, (request, response) -> response.getWriter().write("next"));
            assertThat(next.getContentAsString()).isEqualTo("next");
        }
    }

    @Test void holdsAdmissionUntilTheResponseWriteFinishesRatherThanOnlyModelExecution() throws Exception {
        var writing = new CountDownLatch(1);
        var finish = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        var task = executor.submit(() -> {
            filter.doFilter(run(), new MockHttpServletResponse(), (request, response) -> {
                writing.countDown();
                try { if (!finish.await(10, TimeUnit.SECONDS)) throw new IOException("test latch timed out"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException(e); }
                response.getWriter().write("done");
            });
            return null;
        });
        try {
            assertThat(writing.await(5, TimeUnit.SECONDS)).isTrue();
            var rejected = new MockHttpServletResponse();
            filter.doFilter(run(), rejected, (request, response) -> {throw new AssertionError("busy request executed");});
            assertThat(rejected.getStatus()).isEqualTo(503);
            assertThat(rejected.getHeader("Retry-After")).isEqualTo("1");
        } finally { finish.countDown(); executor.shutdown(); }
        task.get(5, TimeUnit.SECONDS);
        var after = new MockHttpServletResponse();
        filter.doFilter(run(), after, (request, response) -> response.getWriter().write("available"));
        assertThat(after.getContentAsString()).isEqualTo("available");
    }
}
