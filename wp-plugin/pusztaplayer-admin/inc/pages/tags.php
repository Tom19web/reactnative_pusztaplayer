<?php
/**
 * PusztaPlayer Admin — Címke Kezelő oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_tags() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>Címke Kezelő</h1>';
    ppadmin_render_flash();

    if (isset($_POST['pp_save_tag']) && check_admin_referer('ppadmin_tag_save')) {
        $sid = intval($_POST['sid']);
        $tags = sanitize_text_field($_POST['tags']);
        $lang = sanitize_text_field($_POST['language']);
        $res = ppadmin_api_post('/admin/channel-tags', null, [
            'stream_id' => $sid, 'tags' => $tags, 'language' => $lang,
        ]);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Címkék mentve (' . $sid . ').');
    }

    $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
    $tag_f = isset($_GET['tag']) ? sanitize_text_field($_GET['tag']) : '';
    $page = isset($_GET['ppage']) ? max(1, intval($_GET['ppage'])) : 1;

    $data = ppadmin_api_get('/admin/channel-tags', [
        'page' => $page, 'per_page' => 50, 'search' => $search, 'tag' => $tag_f,
    ]);

    if (isset($data['__error'])) {
        ppadmin_render_notice('error', $data['__error']);
        echo '</div>';
        return;
    }

    $items = $data['items'] ?? [];
    $total = $data['total'] ?? 0;
    $valid_tags = $data['valid_tags'] ?? [];

    echo '<form method="get" class="ppa-filterbar">';
    echo '<input type="hidden" name="page" value="ppadmin-tags" />';
    echo '<input type="text" name="s" value="' . esc_attr($search) . '" placeholder="Név..." class="ppa-input" /> ';
    echo '<select name="tag" class="ppa-select"><option value="">Összes címke</option>';
    foreach ($valid_tags as $t) {
        echo '<option value="' . esc_attr($t) . '"' . selected($tag_f, $t, false) . '>' . esc_html($t) . '</option>';
    }
    echo '</select> <button class="ppa-btn">Szűrés</button>';
    echo '</form>';

    echo '<table class="widefat striped ppa-table"><thead><tr>
        <th>Stream ID</th><th>Név</th><th>Címkék</th><th>Nyelv</th><th>Biz.</th><th>Szerkesztés</th>
    </tr></thead><tbody>';
    if (empty($items)) echo '<tr><td colspan="6">Nincs találat.</td></tr>';
    foreach ($items as $it) {
        $sid = $it['stream_id'] ?? '';
        echo '<tr>';
        echo '<td>' . esc_html($sid) . '</td>';
        echo '<td>' . esc_html($it['name'] ?? '') . '</td>';
        echo '<td>';
        $tags = is_array($it['tags'] ?? null) ? $it['tags'] : [];
        foreach ($tags as $t) {
            echo '<span class="ppa-tag">' . esc_html($t) . '</span>';
        }
        echo '</td>';
        echo '<td>' . esc_html($it['language'] ?? '—') . '</td>';
        $conf = (float) ($it['confidence'] ?? 0);
        $clr = $conf >= 0.7 ? 'ppa-green' : ($conf >= 0.5 ? 'ppa-yellow' : 'ppa-red');
        echo '<td><span class="' . esc_attr($clr) . '">' . (!empty($it['auto_tagged']) ? '🤖' : '✏️') . ' ' . round($conf * 100) . '%</span></td>';
        echo '<td><details class="ppa-details"><summary class="ppa-btn" style="padding:4px 10px;font-size:12px;">Szerkesztés</summary>';
        echo '<form method="post" style="margin-top:8px;">';
        wp_nonce_field('ppadmin_tag_save');
        echo '<input type="hidden" name="pp_save_tag" value="1" />';
        echo '<input type="hidden" name="sid" value="' . esc_attr($sid) . '" />';
        echo '<label>Címkék (vesszővel):<br><input type="text" name="tags" value="' . esc_attr(implode(',', $tags)) . '" class="ppa-input" style="width:180px;" /></label><br>';
        echo '<label>Nyelv:<br><select name="language" class="ppa-select" style="width:80px;"><option value="">—</option>';
        foreach (['hu','en','de','ro','multi'] as $lg) {
            echo '<option value="' . esc_attr($lg) . '"' . selected($it['language'] ?? '', $lg, false) . '>' . esc_html($lg) . '</option>';
        }
        echo '</select></label><br>';
        echo '<button class="ppa-btn ppa-btn-primary" style="margin-top:6px;">Mentés</button>';
        echo '</form></details></td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
    echo '<div style="margin-top:12px;">' . ppadmin_pagination($total, 50, $page, ['s' => $search, 'tag' => $tag_f]) . '</div>';
    echo '</div>';
}
