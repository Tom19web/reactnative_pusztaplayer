<?php
/**
 * PusztaPlayer Admin — EPG / Csatornák oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_epg() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>EPG / Csatornák</h1>';
    ppadmin_render_flash();

    // Kategória törlés (GET link)
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'del_cat' && check_admin_referer('ppadmin_cat_delete')) {
        $cid = isset($_GET['ppcat']) ? intval($_GET['ppcat']) : 0;
        if ($cid > 0) {
            $res = ppadmin_api_post('/admin/delete-category', null, ['category_id' => $cid]);
            if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
            else ppadmin_redirect_msg('Kategória törölve.');
        }
        ppadmin_redirect_msg('Érvénytelen kategória ID.', true);
    }

    // HU mapping mentés
    if (isset($_POST['pp_save_mapping']) && check_admin_referer('ppadmin_mapping')) {
        $mapping = isset($_POST['mapping']) && is_array($_POST['mapping']) ? array_map('intval', $_POST['mapping']) : [];
        $res = ppadmin_api_post('/admin/epg-hu-mapping', ['mapping' => $mapping]);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'HU EPG mapping mentve.');
    }

    // 1. Missing Analysis
    $missing = ppadmin_api_get('/admin/missing-analysis');
    echo '<div class="ppa-box">';
    echo '<h2>Missing Analysis</h2>';
    $cats = isset($missing['categories']) && is_array($missing['categories']) ? $missing['categories'] : [];
    if (empty($cats)) {
        echo '<p class="ppa-muted">Nincs adat vagy backend hiba.</p>';
    }
    foreach ($cats as $cat) {
        $name = $cat['name'] ?? '';
        $total = $cat['total'] ?? 0;
        $no_logo = $cat['no_logo'] ?? 0;
        $no_epg = $cat['no_epg'] ?? 0;
        echo '<div class="ppa-row">';
        echo '<strong>' . esc_html($name) . '</strong> <span class="ppa-red">(' . (int) $total . ' csat.)</span> ';
        echo '<span class="ppa-red">🚫' . (int) $no_logo . ' logo</span> ';
        echo '<span class="ppa-red">📡' . (int) $no_epg . ' EPG</span> ';
        if (isset($cat['category_id'])) {
            $url = wp_nonce_url(add_query_arg(['ppaction' => 'del_cat', 'ppcat' => (int) $cat['category_id']], ppadmin_self_url()), 'ppadmin_cat_delete');
            echo '<a class="ppa-btn ppa-btn-danger" href="' . esc_url($url) . '">Törlés</a>';
        }
        echo '</div>';
    }
    echo '</div>';

    // 2. HU EPG Mapping
    $hu = ppadmin_api_get('/admin/epg-hu-mapping');
    $mapping_rows = isset($hu['channels']) && is_array($hu['channels']) ? $hu['channels'] : [];
    echo '<div class="ppa-box">';
    echo '<h2>🇭🇺 HU EPG Mapping</h2>';
    if (!empty($mapping_rows)) {
        echo '<form method="post">';
        wp_nonce_field('ppadmin_mapping');
        echo '<table class="widefat striped ppa-table"><thead><tr><th>Név</th><th>Programok</th><th>Stream ID</th></tr></thead><tbody>';
        foreach ($mapping_rows as $ch) {
            $cname = $ch['name'] ?? '';
            echo '<tr><td>' . esc_html($cname) . '</td><td>' . esc_html($ch['programmes'] ?? 0) . '</td>';
            echo '<td><input type="number" name="mapping[' . esc_attr($cname) . ']" value="' . esc_attr($ch['xtream_sid'] ?? '') . '" class="ppa-input" style="width:100px;" /></td></tr>';
        }
        echo '</tbody></table>';
        echo '<button class="ppa-btn ppa-btn-primary" name="pp_save_mapping" value="1" style="margin-top:10px;">Mentés</button>';
        echo '</form>';
    } else {
        echo '<p class="ppa-muted">Nincs HU mapping adat.</p>';
    }
    echo '</div>';

    // 3. Csatornalista + EPG
    $ch_search = isset($_GET['chs']) ? sanitize_text_field($_GET['chs']) : '';
    $ch_cat = isset($_GET['chc']) ? sanitize_text_field($_GET['chc']) : '';
    $ch_epg = isset($_GET['che']) ? sanitize_text_field($_GET['che']) : '';
    $ch_page = isset($_GET['chp']) ? max(1, intval($_GET['chp'])) : 1;
    $chs = ppadmin_api_get('/admin/channel-list', [
        'page' => $ch_page, 'per_page' => 50, 'search' => $ch_search, 'category' => $ch_cat, 'epg_filter' => $ch_epg,
    ]);
    echo '<div class="ppa-box">';
    echo '<h2>📺 Csatornalista + EPG</h2>';
    echo '<form method="get" class="ppa-filterbar">';
    echo '<input type="hidden" name="page" value="ppadmin-epg" />';
    echo '<input type="text" name="chs" value="' . esc_attr($ch_search) . '" placeholder="Név..." class="ppa-input" /> ';
    $categories = isset($chs['categories']) && is_array($chs['categories']) ? $chs['categories'] : [];
    echo '<select name="chc" class="ppa-select"><option value="">Összes kategória</option>';
    foreach ($categories as $c) {
        echo '<option value="' . esc_attr($c) . '"' . selected($ch_cat, $c, false) . '>' . esc_html($c) . '</option>';
    }
    echo '</select> ';
    echo '<select name="che" class="ppa-select"><option value="">EPG: mind</option><option value="has_epg"' . selected($ch_epg, 'has_epg', false) . '>✅ Van</option><option value="no_epg"' . selected($ch_epg, 'no_epg', false) . '>❌ Nincs</option></select> ';
    echo '<button class="ppa-btn">Szűrés</button>';
    echo '</form>';

    $channels = isset($chs['channels']) && is_array($chs['channels']) ? $chs['channels'] : [];
    echo '<table class="widefat striped ppa-table"><thead><tr><th>ID</th><th>Név / EPG ID</th><th>Kategória</th><th>Now Playing</th><th>EPG</th></tr></thead><tbody>';
    if (empty($channels)) echo '<tr><td colspan="5">Nincs találat.</td></tr>';
    foreach ($channels as $ch) {
        $sid = $ch['stream_id'] ?? '';
        $disp = !empty($ch['epg_channel_id']) ? $ch['epg_channel_id'] : ($ch['name'] ?? '#'.$sid);
        echo '<tr>';
        echo '<td>' . esc_html($sid) . '</td>';
        echo '<td>' . esc_html($disp) . '</td>';
        echo '<td>' . esc_html($ch['category'] ?? '') . '</td>';
        echo '<td>' . esc_html($ch['now_playing'] ?? '—') . '</td>';
        echo '<td>' . (!empty($ch['has_epg']) ? '✅' : '❌') . '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
    echo '<div style="margin-top:12px;">' . ppadmin_pagination($chs['total'] ?? 0, 50, $ch_page, ['chs' => $ch_search, 'chc' => $ch_cat, 'che' => $ch_epg], 'chp') . '</div>';
    echo '</div>';

    echo '</div>';
}
