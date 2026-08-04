<?php
/**
 * PusztaPlayer Admin — Docker Manager oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_docker() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>Docker Manager</h1>';
    ppadmin_render_flash();

    // Műveletek
    if (isset($_GET['ppaction']) && check_admin_referer('ppadmin_docker')) {
        $action = sanitize_key($_GET['ppaction']);
        if ($action === 'restart_all') {
            $res = ppadmin_api_post('/admin/docker/restart-all');
            if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
            else ppadmin_redirect_msg('Összes konténer újraindítva.');
        } elseif ($action === 'stop') {
            $res = ppadmin_api_post('/admin/docker/stop');
            if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
            else ppadmin_redirect_msg('Összes konténer leállítva.');
        } elseif ($action === 'cache') {
            $res = ppadmin_api_post('/admin/docker/cache-clear');
            if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
            else ppadmin_redirect_msg('Cache törölve + fastapi restart.');
        }
    }

    // Egy konténer restart
    if (isset($_POST['pp_restart']) && check_admin_referer('ppadmin_docker')) {
        $name = sanitize_text_field($_POST['name']);
        $res = ppadmin_api_post('/admin/docker/restart/' . urlencode($name));
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Konténer újraindítva: ' . $name);
    }

    $data = ppadmin_api_get('/admin/docker/status');
    if (isset($data['__error'])) {
        ppadmin_render_notice('error', $data['__error']);
        echo '</div>';
        return;
    }

    // Globális gombok
    $base = remove_query_arg(['ppaction', 'ppmsg', 'pperr']);
    echo '<div class="ppa-actions">';
    echo '<a class="ppa-btn ppa-btn-secondary" href="' . esc_url(wp_nonce_url(add_query_arg(['ppaction' => 'restart_all'], $base), 'ppadmin_docker')) . '">🔄 Összes újraindítás</a>';
    echo '<a class="ppa-btn ppa-btn-secondary" href="' . esc_url(wp_nonce_url(add_query_arg(['ppaction' => 'stop'], $base), 'ppadmin_docker')) . '">⏹ Összes leállítás</a>';
    echo '<a class="ppa-btn ppa-btn-secondary" href="' . esc_url(wp_nonce_url(add_query_arg(['ppaction' => 'cache'], $base), 'ppadmin_docker')) . '">🧹 Cache + Rebuild</a>';
    echo '</div>';

    $containers = isset($data['containers']) && is_array($data['containers']) ? $data['containers'] : [];
    echo '<table class="widefat striped ppa-table"><thead><tr>
        <th>Név</th><th>Image</th><th>Állapot</th><th>Portok</th><th>Műveletek</th>
    </tr></thead><tbody>';
    if (empty($containers)) echo '<tr><td colspan="5">Nincs konténer adat.</td></tr>';
    foreach ($containers as $c) {
        $name = $c['name'] ?? '';
        $state = $c['state'] ?? '';
        $icon = $state === 'running' ? '🟢' : '🔴';
        echo '<tr>';
        echo '<td>' . $icon . ' ' . esc_html($name) . '</td>';
        echo '<td>' . esc_html($c['image'] ?? '') . '</td>';
        echo '<td>' . esc_html($c['status'] ?? '') . '</td>';
        echo '<td>' . esc_html($c['ports'] ?? '—') . '</td>';
        echo '<td>';
        // Log
        echo '<details class="ppa-details" style="margin-bottom:4px;"><summary class="ppa-btn" style="padding:4px 10px;font-size:12px;">📄 Log</summary>';
        $log = ppadmin_api_get('/admin/docker/logs/' . urlencode($name), ['tail' => 200]);
        $out = isset($log['output']) ? $log['output'] : (isset($log['__error']) ? $log['__error'] : '');
        echo '<pre class="ppa-log">' . esc_html(mb_substr($out, -3000)) . '</pre>';
        echo '</details>';
        // Restart
        echo '<form method="post" class="ppa-inline">';
        wp_nonce_field('ppadmin_docker');
        echo '<input type="hidden" name="pp_restart" value="1" />';
        echo '<input type="hidden" name="name" value="' . esc_attr($name) . '" />';
        echo '<button class="ppa-btn" style="padding:4px 10px;font-size:12px;">🔄</button>';
        echo '</form>';
        echo '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
    echo '</div>';
}
