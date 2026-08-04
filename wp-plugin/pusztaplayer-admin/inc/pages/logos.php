<?php
/**
 * PusztaPlayer Admin — Logo Kezelő oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_logos() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>Logo Kezelő</h1>';
    ppadmin_render_flash();

    // Művelet feldolgozás
    if (isset($_POST['pp_merge_logo']) && check_admin_referer('ppadmin_logo_merge')) {
        $sid = intval($_POST['sid']);
        $matched = sanitize_text_field($_POST['matched_name']);
        $country = sanitize_text_field($_POST['country']);
        $res = ppadmin_api_post('/admin/logos/merge', null, [
            'stream_id' => $sid,
            'channel_name' => sanitize_text_field($_POST['channel_name']),
            'matched_name' => $matched,
            'country' => $country,
        ]);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Logo merge mentve.');
    }

    if (isset($_POST['pp_del_logo']) && check_admin_referer('ppadmin_logo_delete')) {
        $sid = intval($_POST['sid']);
        $res = ppadmin_api_delete('/admin/logos/' . $sid);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Logo törölve.');
    }

    // Keresés + szűrők
    $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
    $page = isset($_GET['ppage']) ? max(1, intval($_GET['ppage'])) : 1;
    $per_page = 30;

    $data = ppadmin_api_get('/admin/logos/list', [
        'page' => $page, 'per_page' => $per_page, 'search' => $search,
    ]);

    if (isset($data['__error'])) {
        ppadmin_render_notice('error', $data['__error']);
        echo '</div>';
        return;
    }

    $logos = $data['logos'] ?? [];
    $total = $data['total'] ?? 0;

    // Kereső űrlap
    echo '<form method="get" class="ppa-filterbar">';
    echo '<input type="hidden" name="page" value="ppadmin-logos" />';
    echo '<input type="text" name="s" value="' . esc_attr($search) . '" placeholder="Keresés..." class="ppa-input" /> ';
    echo '<button class="ppa-btn">Keresés</button>';
    echo '</form>';

    echo '<table class="widefat striped ppa-table"><thead><tr>
        <th>Stream ID</th><th>Csatorna</th><th>Matchelt név</th><th>Forrás</th><th>Logó</th><th>Műveletek</th>
    </tr></thead><tbody>';
    if (empty($logos)) {
        echo '<tr><td colspan="6">Nincs találat.</td></tr>';
    }
    foreach ($logos as $l) {
        echo '<tr>';
        echo '<td>' . esc_html($l['stream_id'] ?? '') . '</td>';
        echo '<td>' . esc_html($l['channel_name'] ?? '—') . '</td>';
        echo '<td>' . esc_html($l['matched_name'] ?? '—') . '</td>';
        echo '<td>' . esc_html($l['source'] ?? '—') . '</td>';
        $url = $l['logo_url'] ?? '';
        echo '<td>' . ($url ? '<a href="' . esc_url($url) . '" target="_blank" rel="noopener">Megnyitás</a>' : '—') . '</td>';
        echo '<td>';

        // Törlés form
        echo '<form method="post" style="display:inline;margin-right:6px;">';
        wp_nonce_field('ppadmin_logo_delete');
        echo '<input type="hidden" name="pp_del_logo" value="1" />';
        echo '<input type="hidden" name="sid" value="' . esc_attr($l['stream_id']) . '" />';
        echo '<button class="ppa-btn ppa-btn-danger" style="padding:4px 10px;font-size:12px;">Törlés</button>';
        echo '</form>';

        // Merge form (collapsed details)
        echo '<details class="ppa-details" style="display:inline;"><summary class="ppa-btn" style="padding:4px 10px;font-size:12px;">Merge</summary>';
        echo '<form method="post" style="margin-top:8px;">';
        wp_nonce_field('ppadmin_logo_merge');
        echo '<input type="hidden" name="pp_merge_logo" value="1" />';
        echo '<input type="hidden" name="sid" value="' . esc_attr($l['stream_id']) . '" />';
        echo '<input type="hidden" name="channel_name" value="' . esc_attr($l['channel_name'] ?? '') . '" />';
        echo '<label>XMLTV név:<br><input type="text" name="matched_name" value="' . esc_attr($l['matched_name'] ?? '') . '" class="ppa-input" style="width:140px;" /></label><br>';
        echo '<label>Ország:<br><select name="country" class="ppa-select" style="width:60px;"><option value="hu">hu</option><option value="de">de</option><option value="at">at</option><option value="ro">ro</option><option value="ch">ch</option><option value="it">it</option></select></label><br>';
        echo '<button class="ppa-btn ppa-btn-primary" style="margin-top:6px;">Mentés</button>';
        echo '</form></details>';

        echo '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';

    echo '<div style="margin-top:12px;">' . ppadmin_pagination($total, $per_page, $page, ['s' => $search]) . '</div>';
    echo '</div>';
}
