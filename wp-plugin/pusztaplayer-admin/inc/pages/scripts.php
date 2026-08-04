<?php
/**
 * PusztaPlayer Admin — Script Editor oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_scripts() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>Script Editor</h1>';
    ppadmin_render_flash();

    if (isset($_POST['pp_save_script']) && check_admin_referer('ppadmin_script_save')) {
        $name = sanitize_file_name($_POST['name']);
        $content = wp_unslash($_POST['content']);
        $res = ppadmin_api_post('/admin/docker/scripts/' . urlencode($name), ['content' => $content]);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Script mentve: ' . $name);
    }

    // Script futtatás
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'run_script' && isset($_GET['script']) && check_admin_referer('ppadmin_script_run')) {
        $script = sanitize_file_name($_GET['script']);
        if (!$script) {
            ppadmin_redirect_msg('Érvénytelen script név.', true);
        }
        $res = ppadmin_api_post('/admin/docker/scripts/' . urlencode($script) . '/run');
        if (isset($res['__error'])) {
            ppadmin_redirect_msg($res['__error'], true);
        }
        $task = $res['task_id'] ?? '—';
        update_option('ppadmin_last_task', $task);
        ppadmin_redirect_msg('▶ Elindítva: ' . ($res['script'] ?? $script));
    }

    $scripts_data = ppadmin_api_get('/admin/docker/scripts');
    $scripts = isset($scripts_data['scripts']) && is_array($scripts_data['scripts']) ? $scripts_data['scripts'] : [];

    $selected = isset($_GET['name']) ? sanitize_file_name($_GET['name']) : '';
    $content = '';
    if ($selected) {
        $sc = ppadmin_api_get('/admin/docker/scripts/' . urlencode($selected));
        if (isset($sc['content'])) $content = $sc['content'];
        elseif (isset($sc['__error'])) ppadmin_render_notice('error', $sc['__error']);
    }

    echo '<div class="ppa-box">';
    echo '<h2>Scriptek</h2>';
    echo '<p class="ppa-muted" style="font-size:12px;margin-bottom:12px;">A szerkesztett scriptek a szerveren futnak. Csak megbízható környezetben használd.</p>';
    echo '<select id="pp-script-select" class="ppa-select" style="width:100%;max-width:500px;" onchange="if(this.value)window.location.href=this.value;">';
    echo '<option value="">— Válassz scriptet —</option>';
    foreach ($scripts as $sc) {
        $url = add_query_arg(['name' => $sc['name']], remove_query_arg('name'));
        $sel = $selected === $sc['name'] ? ' selected' : '';
        echo '<option value="' . esc_url($url) . '"' . $sel . '>' . esc_html($sc['name'] . ' (' . round($sc['size'] / 1024) . ' KB)') . '</option>';
    }
    echo '</select>';
    echo '</div>';

    if ($selected) {
        echo '<div class="ppa-box">';
        echo '<h2>Szerkesztés: ' . esc_html($selected) . '</h2>';

        // Futtatás gomb
        $run_url = wp_nonce_url(add_query_arg(['ppaction' => 'run_script', 'script' => $selected], ppadmin_self_url()), 'ppadmin_script_run');
        echo '<div class="ppa-actions">';
        echo '<a href="' . esc_url($run_url) . '" class="ppa-btn ppa-btn-success">▶ Futtatás</a>';
        $last_task = get_option('ppadmin_last_task', '');
        if ($last_task) {
            $dash_url = admin_url('admin.php?page=ppadmin');
            echo '<a href="' . esc_url($dash_url) . '" class="ppa-btn ppa-btn-secondary">📄 Log megtekintése</a>';
        }
        echo '</div>';

        echo '<form method="post">';
        wp_nonce_field('ppadmin_script_save');
        echo '<input type="hidden" name="pp_save_script" value="1" />';
        echo '<input type="hidden" name="name" value="' . esc_attr($selected) . '" />';
        echo '<textarea name="content" class="ppa-textarea">' . esc_textarea($content) . '</textarea>';
        echo '<p style="margin-top:10px;"><button class="ppa-btn ppa-btn-primary">💾 Mentés</button></p>';
        echo '</form>';
        echo '</div>';
    }
    echo '</div>';
}
