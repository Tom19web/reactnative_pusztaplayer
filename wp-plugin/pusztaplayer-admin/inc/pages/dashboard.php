<?php
/**
 * PusztaPlayer Admin — Irányítópult oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_dashboard() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>PusztaPlayer Irányítópult</h1>';
    ppadmin_render_flash();

    $stats = ppadmin_api_get('/admin/stats');

    if (isset($stats['__error'])) {
        ppadmin_render_notice('error', 'Backend elérési hiba: ' . $stats['__error']);
        echo '</div>';
        return;
    }

    // Statisztika kártyák
    $cards = [
        ['label' => 'Sessions', 'value' => $stats['sessions'] ?? '—', 'color' => 'yellow'],
        ['label' => 'Logók', 'value' => $stats['logos'] ?? '—', 'color' => 'cyan'],
        ['label' => 'EPG Programok', 'value' => $stats['epg_programs'] ?? '—', 'color' => 'cyan'],
        ['label' => 'Csat. EPG-vel', 'value' => $stats['channels_with_epg'] ?? '—', 'color' => 'green'],
        ['label' => 'Most futó', 'value' => $stats['channels_now_playing'] ?? '—', 'color' => 'green'],
        ['label' => 'Utolsó import', 'value' => isset($stats['last_import']) ? mb_substr($stats['last_import'], 0, 10) : '—', 'color' => 'yellow'],
    ];
    echo '<div class="ppa-stats">';
    foreach ($cards as $c) {
        echo '<div class="ppa-stat">';
        echo '<div class="ppa-stat-label">' . esc_html($c['label']) . '</div>';
        echo '<div class="ppa-stat-value ' . esc_attr($c['color']) . '">' . esc_html($c['value']) . '</div>';
        echo '</div>';
    }
    echo '</div>';

    // Import műveletek
    $imports = [
        'epg_import' => ['label' => '📡 EPG Import', 'path' => '/admin/epg/import'],
        'epg_hu' => ['label' => '🇭🇺 HU Direkt EPG', 'path' => '/admin/epg/hu-direct-import'],
        'cache_clear' => ['label' => '🧹 Cache Törlés', 'path' => '/admin/cache/clear'],
    ];
    echo '<div class="ppa-box">';
    echo '<h2>Műveletek</h2>';
    echo '<div class="ppa-actions">';
    foreach ($imports as $key => $imp) {
        $url = wp_nonce_url(add_query_arg(['ppaction' => $key], ppadmin_self_url()), 'ppadmin_import');
        echo '<a href="' . esc_url($url) . '" class="ppa-btn ppa-btn-secondary">' . esc_html($imp['label']) . '</a>';
    }
    echo '</div>';
    echo '</div>';

    // Művelet feldolgozás
    if (isset($_GET['ppaction']) && check_admin_referer('ppadmin_import')) {
        $action = sanitize_key($_GET['ppaction']);
        if (isset($imports[$action])) {
            $res = ppadmin_api_post($imports[$action]['path']);
            if (isset($res['__error'])) {
                ppadmin_redirect_msg($res['__error'], true);
            } else {
                $task = $res['task_id'] ?? '—';
                update_option('ppadmin_last_task', $task);
                ppadmin_redirect_msg('Elindítva. Task ID: ' . $task);
            }
        }
    }

    // Import log
    $last_task = get_option('ppadmin_last_task', '');
    echo '<div class="ppa-box">';
    echo '<h2>Import Log</h2>';
    if ($last_task) {
        $check_url = wp_nonce_url(add_query_arg(['ppaction' => 'check_log', 'pptask' => $last_task], ppadmin_self_url()), 'ppadmin_import');
        echo '<p>Legutóbbi task: <code class="ppa-code">' . esc_html($last_task) . '</code> ';
        echo '<a class="ppa-btn ppa-btn-secondary" href="' . esc_url($check_url) . '">Log frissítés</a></p>';
    }
    if (isset($_GET['pptask']) && isset($_GET['ppaction']) && $_GET['ppaction'] === 'check_log' && check_admin_referer('ppadmin_import')) {
        $task = sanitize_text_field($_GET['pptask']);
        $lines = ppadmin_get_import_log($task);
        if (!empty($lines)) {
            echo '<pre class="ppa-log">' . esc_html(implode("\n", array_slice($lines, -100))) . '</pre>';
        } else {
            echo '<p class="ppa-muted">Nincs log sor még (vagy a task lejárt).</p>';
        }
    }
    echo '</div>';

    echo '</div>';
}
