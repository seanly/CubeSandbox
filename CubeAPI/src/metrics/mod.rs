// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Prometheus metrics for CubeAPI.
//
// Usage:
//   1. Call `register_all()` once at startup.
//   2. Use the lazy_static metrics in handlers/services.
//   3. Scrape via GET /metrics (registered in routes.rs).

use lazy_static::lazy_static;
use prometheus::{Counter, Gauge, Histogram, Opts, Registry, TextEncoder};

lazy_static! {
    /// Global Prometheus registry for custom business metrics.
    pub static ref REGISTRY: Registry = Registry::new();

    // ── Sandbox lifecycle ────────────────────────────────────────────────────
    pub static ref ACTIVE_SANDBOXES: Gauge = Gauge::with_opts(Opts::new(
        "cubesandbox_active_sandboxes",
        "Number of currently active sandboxes"
    )).expect("metric registration");

    pub static ref SANDBOX_CREATED_TOTAL: Counter = Counter::with_opts(Opts::new(
        "cubesandbox_sandbox_created_total",
        "Total number of sandboxes created"
    )).expect("metric registration");

    pub static ref SANDBOX_DESTROYED_TOTAL: Counter = Counter::with_opts(Opts::new(
        "cubesandbox_sandbox_destroyed_total",
        "Total number of sandboxes destroyed"
    )).expect("metric registration");

    pub static ref SANDBOX_CREATE_FAILED_TOTAL: Counter = Counter::with_opts(Opts::new(
        "cubesandbox_sandbox_create_failed_total",
        "Total number of sandbox creation failures"
    )).expect("metric registration");

    // ── Template lifecycle ───────────────────────────────────────────────────
    pub static ref TEMPLATE_COUNT: Gauge = Gauge::with_opts(Opts::new(
        "cubesandbox_template_count",
        "Number of registered templates"
    )).expect("metric registration");

    pub static ref TEMPLATE_CREATED_TOTAL: Counter = Counter::with_opts(Opts::new(
        "cubesandbox_template_created_total",
        "Total number of templates created"
    )).expect("metric registration");

    // ── Scheduling / operations ──────────────────────────────────────────────
    pub static ref SCHEDULING_LATENCY: Histogram = Histogram::with_opts(
        prometheus::HistogramOpts::new("cubesandbox_scheduling_latency_seconds", "Time spent scheduling a sandbox")
            .const_label("service", "cube-api")
            .buckets(prometheus::exponential_buckets(0.001, 2.0, 15).unwrap())
    ).expect("metric registration");

    // ── Snapshot operations ──────────────────────────────────────────────────
    pub static ref SNAPSHOT_CREATED_TOTAL: Counter = Counter::with_opts(Opts::new(
        "cubesandbox_snapshot_created_total",
        "Total number of snapshots created"
    )).expect("metric registration");
}

/// Register all custom metrics with the global registry.
/// Must be called exactly once before serving /metrics.
pub fn register_all() {
    let _ = REGISTRY.register(Box::new(ACTIVE_SANDBOXES.clone()));
    let _ = REGISTRY.register(Box::new(SANDBOX_CREATED_TOTAL.clone()));
    let _ = REGISTRY.register(Box::new(SANDBOX_DESTROYED_TOTAL.clone()));
    let _ = REGISTRY.register(Box::new(SANDBOX_CREATE_FAILED_TOTAL.clone()));
    let _ = REGISTRY.register(Box::new(TEMPLATE_COUNT.clone()));
    let _ = REGISTRY.register(Box::new(TEMPLATE_CREATED_TOTAL.clone()));
    let _ = REGISTRY.register(Box::new(SCHEDULING_LATENCY.clone()));
    let _ = REGISTRY.register(Box::new(SNAPSHOT_CREATED_TOTAL.clone()));
}

/// Encode all custom metrics in Prometheus text format.
pub fn encode_custom() -> String {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    encoder
        .encode_to_string(&metric_families)
        .unwrap_or_else(|e| format!("# ERROR encoding metrics: {}\n", e))
}
