<?php
/**
 * PusztaPlayer Admin — API és UI segédfüggvények.
 */

if (!defined('ABSPATH')) exit;

// ─── Settings ─────────────────────────────────────

function ppadmin_get_credentials(): array {
    return [
        'api_base'  => rtrim(get_option('ppadmin_api_base', 'https://live.pusztaplay.eu'), '/'),
        'auth_user' => get_option('ppadmin_auth_user', 'puszta_admin'),
        'auth_pass' => get_option('ppadmin_auth_pass', 'csodalatos_v8_motor'),
        'page_slug' => get_option('ppadmin_page_slug', 'pusztaplayer-admin'),
        'admin_pass' => get_option('ppadmin_admin_pass', 'csodalatos_v8_motor'),
    ];
}

// ─── API Helpers ──────────────────────────────────

function ppadmin_request(string $method, string $path, array $query = [], $body = null) {
    $cfg = ppadmin_get_credentials();
    $url = $cfg['api_base'] . '/api/v1' . $path;
    if ($query) {
        $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($query);
    }
    $args = [
        'method'  => strtoupper($method),
        'headers' => [
            'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
        ],
        'timeout' => 90,
        'redirection' => 0,
    ];
    if ($body !== null) {
        $args['body'] = is_string($body) ? $body : json_encode($body);
        $args['headers']['Content-Type'] = 'application/json';
    }
    $resp = wp_remote_request($url, $args);
    if (is_wp_error($resp)) {
        return ['__error' => $resp->get_error_message()];
    }
    $code = (int) wp_remote_retrieve_response_code($resp);
    $raw = wp_remote_retrieve_body($resp);
    $data = json_decode($raw, true);
    if ($code >= 400) {
        $msg = is_array($data)
            ? ($data['error'] ?? $data['detail'] ?? "HTTP $code")
            : "HTTP $code";
        return ['__error' => "$msg (HTTP $code)", '__http' => $code];
    }
    if (!is_array($data)) {
        return ['__error' => "Érvénytelen válasz (HTTP $code): " . mb_substr($raw, 0, 200)];
    }
    $data['__http'] = $code;
    return $data;
}

function ppadmin_api_get(string $path, array $query = []) {
    return ppadmin_request('GET', $path, $query);
}

function ppadmin_api_post(string $path, $body = null, array $query = []) {
    return ppadmin_request('POST', $path, $query, $body);
}

function ppadmin_api_delete(string $path, array $query = []) {
    return ppadmin_request('DELETE', $path, $query);
}

/**
 * Az import log SSE stream-et ad vissza (nem JSON). Kiolvassa a raw body-t
 * és kinyeri a `data: {"line": "..."}` sorokat.
 */
function ppadmin_get_import_log(string $task_id): array {
    $cfg = ppadmin_get_credentials();
    $url = $cfg['api_base'] . '/api/v1/admin/import/stream/' . urlencode($task_id);
    $args = [
        'timeout' => 90,
        'redirection' => 0,
        'headers' => [
            'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
        ],
    ];
    $resp = wp_remote_get($url, $args);
    if (is_wp_error($resp)) return [];
    $body = wp_remote_retrieve_body($resp);
    $lines = [];
    foreach (explode("\n", $body) as $raw) {
        $raw = trim($raw);
        if (strpos($raw, 'data: ') === 0) {
            $json = trim(substr($raw, 6));
            $item = json_decode($json, true);
            if (is_array($item) && isset($item['line'])) {
                $lines[] = (string) $item['line'];
            }
        }
    }
    return $lines;
}

// ─── UI Helpers ───────────────────────────────────

function ppadmin_render_notice(string $type, string $msg) {
    $cls = $type === 'error' ? 'ppa-notice-error' : 'ppa-notice-success';
    echo '<div class="ppa-notice ' . esc_attr($cls) . '"><p>' . esc_html($msg) . '</p></div>';
}

function ppadmin_self_url(): string {
    return remove_query_arg(['ppaction', 'pptask', 'ppmsg', 'pperr']);
}

/**
 * Redirect a tiszta URL-re flash üzenettel (PRG minta, hogy refresh ne
 * futtassa újra a mutáló akciót).
 */
function ppadmin_redirect_msg(string $msg, bool $error = false) {
    $url = remove_query_arg(['ppaction', 'pptask', 'ppmsg', 'pperr', '_wpnonce']);
    $url = add_query_arg($error ? 'pperr' : 'ppmsg', $msg, $url);
    wp_safe_redirect($url);
    exit;
}

function ppadmin_render_flash() {
    if (isset($_GET['ppmsg'])) {
        ppadmin_render_notice('success', wp_unslash($_GET['ppmsg']));
    }
    if (isset($_GET['pperr'])) {
        ppadmin_render_notice('error', wp_unslash($_GET['pperr']));
    }
}

function ppadmin_pagination(int $total, int $per_page, int $page, array $keep = [], string $param = 'ppage'): string {
    $pages = max(1, (int) ceil($total / $per_page));
    if ($pages <= 1) return '';
    $base = add_query_arg(array_merge($keep, [$param => 'PP']), ppadmin_self_url());
    $html = '<div class="ppa-pagination">';
    for ($i = 1; $i <= $pages; $i++) {
        $url = str_replace('PP', $i, $base);
        if ($i === $page) {
            $html .= '<span class="ppa-btn ppa-btn-primary disabled" style="margin:0 2px;cursor:default;">' . $i . '</span>';
        } else {
            $html .= '<a class="ppa-btn ppa-btn-secondary" style="margin:0 2px;" href="' . esc_url($url) . '">' . $i . '</a>';
        }
    }
    $html .= ' <span class="ppa-muted" style="margin-left:8px;">' . $total . ' találat</span>';
    $html .= '</div>';
    return $html;
}
