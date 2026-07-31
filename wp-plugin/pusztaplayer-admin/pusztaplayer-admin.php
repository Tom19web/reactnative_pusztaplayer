<?php
/**
 * Plugin Name: PusztaPlayer Admin
 * Plugin URI: https://pusztaplay.eu
 * Description: Webes admin felület a PusztaPlayer backend menedzseléséhez.
 * Version: 1.0.0
 * Author: PusztaPlayer
 */

if (!defined('ABSPATH')) exit;

define('PPADMIN_VERSION', '1.0.0');
define('PPADMIN_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PPADMIN_PLUGIN_URL', plugin_dir_url(__FILE__));

// ─── Settings ────────────────────────────────────

function ppadmin_get_credentials(): array {
    return [
        'api_base'  => get_option('ppadmin_api_base', 'https://live.pusztaplay.eu'),
        'auth_user' => get_option('ppadmin_auth_user', 'puszta_admin'),
        'auth_pass' => get_option('ppadmin_auth_pass', 'csodalatos_v8_motor'),
        'page_slug' => get_option('ppadmin_page_slug', 'pusztaplayer-admin'),
        'admin_pass' => get_option('ppadmin_admin_pass', 'csodalatos_v8_motor'),
    ];
}

// ─── Settings Page ──────────────────────────────

add_action('admin_menu', function () {
    add_options_page(
        'PusztaPlayer Admin',
        'PusztaPlayer',
        'manage_options',
        'ppadmin-settings',
        'ppadmin_settings_page'
    );
});

function ppadmin_settings_page() {
    if (!current_user_can('manage_options')) return;

    if (isset($_POST['ppadmin_save'])) {
        check_admin_referer('ppadmin_save');
        update_option('ppadmin_api_base', sanitize_text_field($_POST['api_base']));
        update_option('ppadmin_auth_user', sanitize_text_field($_POST['auth_user']));
        update_option('ppadmin_auth_pass', sanitize_text_field($_POST['auth_pass']));
        update_option('ppadmin_page_slug', sanitize_title($_POST['page_slug']));
        update_option('ppadmin_admin_pass', sanitize_text_field($_POST['admin_pass']));
        echo '<div class="notice notice-success"><p>Beállítások mentve.</p></div>';
    }

    $cfg = ppadmin_get_credentials();
    ?>
    <div class="wrap">
        <h1>PusztaPlayer Admin Beállítások</h1>
        <form method="post">
            <?php wp_nonce_field('ppadmin_save'); ?>
            <table class="form-table">
                <tr>
                    <th>Backend API URL</th>
                    <td><input type="url" name="api_base" value="<?php echo esc_attr($cfg['api_base']); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th>Backend felhasználó</th>
                    <td><input type="text" name="auth_user" value="<?php echo esc_attr($cfg['auth_user']); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th>Backend jelszó</th>
                    <td><input type="password" name="auth_pass" value="<?php echo esc_attr($cfg['auth_pass']); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th>Frontend oldal slug</th>
                    <td><input type="text" name="page_slug" value="<?php echo esc_attr($cfg['page_slug']); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th>Admin panel belépési jelszó</th>
                    <td><input type="password" name="admin_pass" value="<?php echo esc_attr($cfg['admin_pass']); ?>" class="regular-text" /></td>
                </tr>
            </table>
            <p class="submit"><button type="submit" name="ppadmin_save" class="button button-primary">Mentés</button></p>
        </form>
    </div>
    <?php
}

// ─── Shortcode ──────────────────────────────────

add_shortcode('pusztaplayer_admin', function () {
    $cfg = ppadmin_get_credentials();
    wp_enqueue_script('ppadmin-ui', PPADMIN_PLUGIN_URL . 'ui/dist/assets/index.js', [], PPADMIN_VERSION, true);
    wp_localize_script('ppadmin-ui', 'PPADMIN_CONFIG', [
        'apiBase'   => rest_url('pusztaplayer/v1'),
        'nonce'     => wp_create_nonce('wp_rest'),
        'adminPass' => $cfg['admin_pass'],
    ]);
    return '<div id="ppadmin-root"></div>';
});

// ─── REST API Proxy ─────────────────────────────

add_action('rest_api_init', function () {
    $cfg = ppadmin_get_credentials();

    $register = function (string $method, string $route, string $backend_path, callable $req_handler = null) use ($cfg) {
        register_rest_route('pusztaplayer/v1', $route, [
            'methods'             => $method,
            'callback'            => function (WP_REST_Request $request) use ($cfg, $backend_path, $method, $req_handler) {
                $url = $cfg['api_base'] . '/api/v1' . $backend_path;

                // Replace path params
                foreach ($request->get_url_params() as $k => $v) {
                    $url = str_replace('{' . $k . '}', $v, $url);
                }

                // Add query params
                $query = $request->get_query_params();
                if ($query) $url .= '?' . http_build_query($query);

                $args = [
                    'method'  => $method,
                    'headers' => [
                        'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
                        'Content-Type'  => 'application/json',
                        'User-Agent'    => 'PusztaPlayer-WP-Admin/' . PPADMIN_VERSION,
                    ],
                    'timeout' => 120,
                ];

                $body = $request->get_body();
                if ($body) $args['body'] = $body;

                $resp = wp_remote_request($url, $args);

                if (is_wp_error($resp)) {
                    return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
                }

                $status = wp_remote_retrieve_response_code($resp);
                $body   = wp_remote_retrieve_body($resp);
                $headers = wp_remote_retrieve_headers($resp);

                $response = new WP_REST_Response(
                    json_decode($body, true) ?: $body,
                    $status
                );

                if ($headers && isset($headers['content-type'])) {
                    $response->header('Content-Type', $headers['content-type']);
                }

                return $response;
            },
            'permission_callback' => function () use ($req_handler) {
                return true; // public REST, real auth is on the backend
            },
        ]);
    };

    $method = fn (string $m) => [
        'methods' => strtoupper($m) === 'GET' ? \WP_REST_Server::READABLE : \WP_REST_Server::CREATABLE,
    ];

    // Stats
    register_rest_route('pusztaplayer/v1', '/admin/stats', [
        'methods' => 'GET',
        'callback' => function () use ($cfg) {
            $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/stats', [
                'headers' => [
                    'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
                ],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Logo list
    register_rest_route('pusztaplayer/v1', '/admin/logos/list', [
        'methods' => 'GET',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $query = http_build_query($req->get_query_params());
            $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/logos/list?' . $query, [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 30,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Logo delete
    register_rest_route('pusztaplayer/v1', '/admin/logos/(?P<sid>\d+)', [
        'methods' => 'DELETE',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $sid = $req->get_param('sid');
            $resp = wp_remote_request($cfg['api_base'] . '/api/v1/admin/logos/' . $sid, [
                'method' => 'DELETE',
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Logo merge
    register_rest_route('pusztaplayer/v1', '/admin/logos/merge', [
        'methods' => 'POST',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $query = http_build_query($req->get_query_params());
            $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/logos/merge?' . $query, [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // XMLTV names
    register_rest_route('pusztaplayer/v1', '/admin/xmltv-names/(?P<country>[a-z]{2})', [
        'methods' => 'GET',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $country = $req->get_param('country');
            $q = $req->get_param('q');
            $url = $cfg['api_base'] . '/api/v1/admin/xmltv-names/' . $country;
            if ($q) $url .= '?q=' . urlencode($q);
            $resp = wp_remote_get($url, [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 30,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Import triggers (non-streaming, returns task_id)
    foreach (['epg/import' => '/admin/epg/import', 'epg/hu-direct-import' => '/admin/epg/hu-direct-import', 'logos/import' => '/admin/logos/import'] as $route => $be_path) {
        register_rest_route('pusztaplayer/v1', '/' . $route, [
            'methods' => 'POST',
            'callback' => function () use ($cfg, $be_path) {
                $resp = wp_remote_post($cfg['api_base'] . '/api/v1' . $be_path, [
                    'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                    'timeout' => 15,
                ]);
                if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
                return json_decode(wp_remote_retrieve_body($resp), true);
            },
            'permission_callback' => '__return_true',
        ]);
    }

    // Cache clear
    register_rest_route('pusztaplayer/v1', '/admin/cache/clear', [
        'methods' => 'POST',
        'callback' => function () use ($cfg) {
            $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/cache/clear', [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Missing analysis
    register_rest_route('pusztaplayer/v1', '/admin/missing-analysis', [
        'methods' => 'GET',
        'callback' => function () use ($cfg) {
            $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/missing-analysis', [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 60,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // Delete category
    register_rest_route('pusztaplayer/v1', '/admin/delete-category', [
        'methods' => 'POST',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $cid = $req->get_param('category_id');
            $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/delete-category?category_id=' . intval($cid), [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 30,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // EPG check
    register_rest_route('pusztaplayer/v1', '/admin/epg-check/(?P<sid>[^/]+)', [
        'methods' => 'GET',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $sid = $req->get_param('sid');
            $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/epg-check/' . urlencode($sid), [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // HU EPG mapping GET
    register_rest_route('pusztaplayer/v1', '/admin/epg-hu-mapping', [
        'methods' => 'GET',
        'callback' => function () use ($cfg) {
            $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/epg-hu-mapping', [
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // HU EPG mapping POST
    register_rest_route('pusztaplayer/v1', '/admin/epg-hu-mapping', [
        'methods' => 'POST',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/epg-hu-mapping', [
                'headers' => [
                    'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
                    'Content-Type'  => 'application/json',
                ],
                'body'    => $req->get_body(),
                'timeout' => 15,
            ]);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);

    // SSE Stream proxy (import log)
    register_rest_route('pusztaplayer/v1', '/admin/import/stream/(?P<task_id>[^/]+)', [
        'methods' => 'GET',
        'callback' => function (WP_REST_Request $req) use ($cfg) {
            $task_id = $req->get_param('task_id');
            $url = $cfg['api_base'] . '/api/v1/admin/import/stream/' . urlencode($task_id);

            // Passthrough SSE — read via WordPress HTTP API
            $resp = wp_remote_get($url, [
                'headers' => [
                    'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
                    'Accept' => 'text/event-stream',
                ],
                'timeout' => 600,
                'stream'  => true,
                'filename' => null,
            ]);

            if (is_wp_error($resp)) {
                return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            }

            $body = wp_remote_retrieve_body($resp);
            return new WP_REST_Response($body, 200, ['Content-Type' => 'text/event-stream']);
        },
        'permission_callback' => '__return_true',
    ]);
});

// ─── Docker Management Proxy ────────────────────

$docker_routes = [
    ['GET',    '/admin/docker/status',            '/admin/docker/status'],
    ['POST',   '/admin/docker/restart-all',       '/admin/docker/restart-all'],
    ['POST',   '/admin/docker/stop',              '/admin/docker/stop'],
    ['POST',   '/admin/docker/cache-clear',       '/admin/docker/cache-clear'],
    ['GET',    '/admin/docker/scripts',           '/admin/docker/scripts'],
    ['GET',    '/admin/docker/channel-list',      '/admin/channel-list'],
];

foreach ($docker_routes as [$method, $route, $backend_path]) {
    register_rest_route('pusztaplayer/v1', $route, [
        'methods' => $method,
        'callback' => function (WP_REST_Request $req) use ($cfg, $backend_path, $method) {
            $url = $cfg['api_base'] . '/api/v1' . $backend_path;
            $query = $req->get_query_params();
            if ($query) $url .= '?' . http_build_query($query);
            $args = [
                'method'  => $method,
                'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
                'timeout' => $method === 'POST' ? 120 : 30,
            ];
            if ($method === 'POST' && $req->get_body()) {
                $args['body'] = $req->get_body();
                $args['headers']['Content-Type'] = 'application/json';
            }
            $resp = wp_remote_request($url, $args);
            if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
            return json_decode(wp_remote_retrieve_body($resp), true);
        },
        'permission_callback' => '__return_true',
    ]);
}

// Docker logs (dynamic container param)
register_rest_route('pusztaplayer/v1', '/admin/docker/logs/(?P<container>[^/]+)', [
    'methods' => 'GET',
    'callback' => function (WP_REST_Request $req) use ($cfg) {
        $container = $req->get_param('container');
        $tail = $req->get_param('tail') ?: 200;
        $url = $cfg['api_base'] . '/api/v1/admin/docker/logs/' . urlencode($container) . '?tail=' . intval($tail);
        $resp = wp_remote_get($url, [
            'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
            'timeout' => 30,
        ]);
        if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
        return json_decode(wp_remote_retrieve_body($resp), true);
    },
    'permission_callback' => '__return_true',
]);

// Docker restart (dynamic container param) + script get/save
register_rest_route('pusztaplayer/v1', '/admin/docker/restart/(?P<container>[^/]+)', [
    'methods' => 'POST',
    'callback' => function (WP_REST_Request $req) use ($cfg) {
        $container = $req->get_param('container');
        $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/docker/restart/' . urlencode($container), [
            'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
            'timeout' => 30,
        ]);
        if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
        return json_decode(wp_remote_retrieve_body($resp), true);
    },
    'permission_callback' => '__return_true',
]);

// Script get
register_rest_route('pusztaplayer/v1', '/admin/docker/script/(?P<name>[^/]+)', [
    'methods' => 'GET',
    'callback' => function (WP_REST_Request $req) use ($cfg) {
        $name = $req->get_param('name');
        $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/docker/scripts/' . urlencode($name), [
            'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
            'timeout' => 15,
        ]);
        if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
        return json_decode(wp_remote_retrieve_body($resp), true);
    },
    'permission_callback' => '__return_true',
]);

// Script save
register_rest_route('pusztaplayer/v1', '/admin/docker/script/(?P<name>[^/]+)', [
    'methods' => 'POST',
    'callback' => function (WP_REST_Request $req) use ($cfg) {
        $name = $req->get_param('name');
        $resp = wp_remote_post($cfg['api_base'] . '/api/v1/admin/docker/scripts/' . urlencode($name), [
            'headers' => [
                'Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']),
                'Content-Type'  => 'application/json',
            ],
            'body'    => $req->get_body(),
            'timeout' => 15,
        ]);
        if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
        return json_decode(wp_remote_retrieve_body($resp), true);
    },
    'permission_callback' => '__return_true',
]);

// Channel list EPG detail
register_rest_route('pusztaplayer/v1', '/admin/channel-epg/(?P<sid>[^/]+)', [
    'methods' => 'GET',
    'callback' => function (WP_REST_Request $req) use ($cfg) {
        $sid = $req->get_param('sid');
        $resp = wp_remote_get($cfg['api_base'] . '/api/v1/admin/channel-list/' . urlencode($sid) . '/epg', [
            'headers' => ['Authorization' => 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass'])],
            'timeout' => 15,
        ]);
        if (is_wp_error($resp)) return new WP_Error('proxy_error', $resp->get_error_message(), ['status' => 502]);
        return json_decode(wp_remote_retrieve_body($resp), true);
    },
    'permission_callback' => '__return_true',
]);

// ─── Activation hook — create page ──────────────

register_activation_hook(__FILE__, function () {
    $cfg = ppadmin_get_credentials();
    $page = get_page_by_path($cfg['page_slug']);
    if (!$page) {
        wp_insert_post([
            'post_title'   => 'PusztaPlayer Admin',
            'post_name'    => $cfg['page_slug'],
            'post_content' => '[pusztaplayer_admin]',
            'post_status'  => 'publish',
            'post_type'    => 'page',
        ]);
    }
});
