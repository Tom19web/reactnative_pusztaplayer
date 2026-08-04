<?php
/**
 * PusztaPlayer Admin — Rádió Kezelő oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_page_radio() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>Rádió Kezelő</h1>';
    ppadmin_render_flash();

    // Rádió import trigger
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'radio_import' && check_admin_referer('ppadmin_radio_import')) {
        $res = ppadmin_api_post('/admin/docker/scripts/import_radio_rapidapi.py/run');
        if (isset($res['__error'])) {
            ppadmin_redirect_msg($res['__error'], true);
        }
        $task = $res['task_id'] ?? '—';
        update_option('ppadmin_last_task', $task);
        ppadmin_redirect_msg('▶ Rádió import elindítva. Task ID: ' . $task);
    }

    // Tömeges deaktiválás
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'deactivate_batch' && check_admin_referer('ppadmin_radio_batch')) {
        $uuids = isset($_GET['uuids']) ? explode(',', sanitize_text_field($_GET['uuids'])) : [];
        $uuids = array_values(array_filter(array_map('trim', $uuids)));
        if (!empty($uuids)) {
            $res = ppadmin_api_post('/admin/radio/batch-deactivate', ['uuids' => $uuids]);
            if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
            else ppadmin_redirect_msg((int) ($res['deactivated'] ?? 0) . ' rádió deaktiválva.');
        }
        ppadmin_redirect_msg('Nincs kijelölt rádió.', true);
    }

    // ICY meta ellenőrzés — single
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'check_single_meta') {
        $uuid = sanitize_text_field($_GET['uuid'] ?? '');
        if (!$uuid) ppadmin_redirect_msg('Hiányzó UUID.', true);
        $res = ppadmin_api_get('/admin/radio/check-meta', ['station_uuid' => $uuid]);
        if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
        if ($res['has_meta']) {
            ppadmin_redirect_msg('✅ ' . esc_html($res['name']) . ': van ICY meta' . ($res['title'] ? ' — ' . esc_html($res['title']) : ''));
        } else {
            ppadmin_redirect_msg('❌ ' . esc_html($res['name']) . ': NINCS ICY meta', true);
        }
    }

    // ICY meta ellenőrzés (bulk)
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'check_radio_meta') {
        $res = ppadmin_api_get('/admin/radio/check-meta');
        if (isset($res['__error'])) {
            ppadmin_redirect_msg($res['__error'], true);
        }
        $total = (int)($res['total'] ?? 0);
        $no_meta = (int)($res['without_meta'] ?? 0);
        ppadmin_redirect_msg("ICY meta ellenőrzés kész: {$total} rádióból {$no_meta} állomásnak nincs meta adata. Részletek a logban.");
    }

    // Deaktiváltak fizikai törlése
    if (isset($_GET['ppaction']) && $_GET['ppaction'] === 'purge_deactivated' && check_admin_referer('ppadmin_radio_purge')) {
        $res = ppadmin_api_post('/admin/radio/purge-deactivated');
        if (isset($res['__error'])) ppadmin_redirect_msg($res['__error'], true);
        else ppadmin_redirect_msg((int) ($res['purged'] ?? 0) . ' deaktivált rádió fizikailag törölve az adatbázisból.');
    }

    // Szerkesztés
    if (isset($_POST['pp_update_radio']) && check_admin_referer('ppadmin_radio_update')) {
        $uuid = sanitize_text_field($_POST['station_uuid']);
        $payload = [
            'name' => sanitize_text_field($_POST['name']),
            'stream_url' => sanitize_text_field($_POST['stream_url']),
            'favicon' => isset($_POST['favicon']) ? sanitize_text_field($_POST['favicon']) : '',
            'tags' => sanitize_text_field($_POST['tags']),
            'language' => sanitize_text_field($_POST['language']),
            'country' => sanitize_text_field($_POST['country']),
            'is_active' => isset($_POST['is_active']) ? true : false,
        ];
        $res = ppadmin_api_post('/admin/radio/' . urlencode($uuid), $payload);
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Rádió mentve: ' . $uuid);
    }

    // Deaktiválás (egyenként)
    if (isset($_POST['pp_del_radio']) && check_admin_referer('ppadmin_radio_delete')) {
        $uuid = sanitize_text_field($_POST['station_uuid']);
        $res = ppadmin_api_delete('/admin/radio/' . urlencode($uuid));
        if (isset($res['__error'])) ppadmin_render_notice('error', $res['__error']);
        else ppadmin_render_notice('success', 'Rádió deaktiválva: ' . $uuid);
    }

    // Import gomb
    $import_url = wp_nonce_url(add_query_arg(['ppaction' => 'radio_import'], ppadmin_self_url()), 'ppadmin_radio_import');
    $purge_url = wp_nonce_url(add_query_arg(['ppaction' => 'purge_deactivated'], ppadmin_self_url()), 'ppadmin_radio_purge');
    $meta_url = add_query_arg(['ppaction' => 'check_radio_meta'], ppadmin_self_url());
    echo '<div class="ppa-actions">';
    echo '<a href="' . esc_url($import_url) . '" class="ppa-btn ppa-btn-secondary">📻 Rádió import</a>';
    echo '<a href="' . esc_url($meta_url) . '" class="ppa-btn ppa-btn-secondary">🔍 ICY meta ellenőrzés</a>';
    echo '<a href="' . esc_url($purge_url) . '" class="ppa-btn ppa-btn-danger" onclick="return confirm(\'Biztosan törlöd az ÖSSZES deaktivált rádiót az adatbázisból?\')">🗑 Deaktiváltak törlése</a>';
    $last_task = get_option('ppadmin_last_task', '');
    if ($last_task) {
        $dash_url = admin_url('admin.php?page=ppadmin');
        echo '<a href="' . esc_url($dash_url) . '" class="ppa-btn ppa-btn-secondary">📄 Log megtekintése</a>';
    }
    echo '</div>';

    // Szűrők + rendezés
    $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
    $tag_f = isset($_GET['tag']) ? sanitize_text_field($_GET['tag']) : '';
    $active_only = isset($_GET['active']) ? true : false;
    $no_logo = isset($_GET['nologo']) ? true : false;
    $dup_only = isset($_GET['dup']) ? true : false;
    $sort = isset($_GET['sort']) ? sanitize_key($_GET['sort']) : 'votes';
    $order = isset($_GET['order']) && $_GET['order'] === 'asc' ? 'asc' : 'desc';
    $page = isset($_GET['ppage']) ? max(1, intval($_GET['ppage'])) : 1;

    $data = ppadmin_api_get('/admin/radio', [
        'page' => $page, 'per_page' => 50, 'search' => $search, 'tag' => $tag_f,
        'active_only' => $active_only, 'no_logo' => $no_logo, 'dup_only' => $dup_only,
        'sort' => $sort, 'order' => $order,
    ]);

    if (isset($data['__error'])) {
        ppadmin_render_notice('error', $data['__error']);
        echo '</div>';
        return;
    }

    $stations = $data['stations'] ?? [];
    $total = $data['total'] ?? 0;

    echo '<form method="get" class="ppa-filterbar">';
    echo '<input type="hidden" name="page" value="ppadmin-radio" />';
    echo '<input type="hidden" name="sort" value="' . esc_attr($sort) . '" />';
    echo '<input type="hidden" name="order" value="' . esc_attr($order) . '" />';
    echo '<input type="text" name="s" value="' . esc_attr($search) . '" placeholder="Név..." class="ppa-input" /> ';
    echo '<input type="text" name="tag" value="' . esc_attr($tag_f) . '" placeholder="Címke..." class="ppa-input" style="width:120px;" /> ';
    echo '<label><input type="checkbox" name="active"' . checked($active_only, true, false) . ' /> Csak aktív</label> ';
    echo '<label><input type="checkbox" name="nologo"' . checked($no_logo, true, false) . ' /> Csak logó nélküli</label> ';
    echo '<label><input type="checkbox" name="dup"' . checked($dup_only, true, false) . ' /> Csak duplikátumok</label> ';
    echo '<button class="ppa-btn">Szűrés</button>';
    echo '</form>';

    // Rendező fejléc helper
    $keep = ['s' => $search, 'tag' => $tag_f]
        + ($active_only ? ['active' => '1'] : [])
        + ($no_logo ? ['nologo' => '1'] : [])
        + ($dup_only ? ['dup' => '1'] : []);
    $cols = [
        'name' => 'Név',
        'stream_url' => 'Stream',
        'favicon' => 'Logó',
        'tags' => 'Címkék',
        'language' => 'Nyelv',
        'bitrate' => 'Bitrate',
        'votes' => 'Szavazat',
        'is_active' => 'Aktív',
    ];

    // Batch deaktiváló URL
    $batch_base = add_query_arg(
        ['ppaction' => 'deactivate_batch', '_wpnonce' => wp_create_nonce('ppadmin_radio_batch')],
        ppadmin_self_url()
    );

    echo '<table class="widefat striped ppa-table"><thead><tr>';
    echo '<th style="width:30px;"><input type="checkbox" onclick="ppadminToggleAll(this)" title="Összes kijelölése" /></th>';
    foreach ($cols as $col_key => $col_label) {
        $next_order = ($sort === $col_key && $order === 'asc') ? 'desc' : 'asc';
        $arrow = '';
        if ($sort === $col_key) {
            $arrow = $order === 'asc' ? ' ▲' : ' ▼';
        }
        $url = add_query_arg(array_merge($keep, ['sort' => $col_key, 'order' => $next_order, 'ppage' => 1]), ppadmin_self_url());
        echo '<th><a href="' . esc_url($url) . '" style="color:#f8f4ec;text-decoration:none;">' . esc_html($col_label) . $arrow . '</a></th>';
    }
    echo '<th>ICY</th>';
    echo '<th>Műveletek</th>';
    echo '</tr></thead><tbody>';
    if (empty($stations)) echo '<tr><td colspan="11">Nincs találat.</td></tr>';
    foreach ($stations as $st) {
        $uuid = $st['station_uuid'] ?? '';
        $favicon = $st['favicon'] ?? '';
        $icy = $st['icy_meta'] ?? null;
        echo '<tr>';
        echo '<td><input type="checkbox" name="uuids[]" value="' . esc_attr($uuid) . '" /></td>';
        echo '<td>' . esc_html($st['name'] ?? '') . '<br><code class="ppa-code">' . esc_html($uuid) . '</code></td>';
        $surl = $st['stream_url'] ?? '';
        echo '<td>' . ($surl ? '<code class="ppa-code" style="word-break:break-all;">' . esc_html($surl) . '</code>' : '—') . '</td>';
        echo '<td>' . ($favicon ? '<a href="' . esc_url($favicon) . '" target="_blank" rel="noopener">🖼 Megnyitás</a>' : '<span class="ppa-red">❌ nincs</span>') . '</td>';
        echo '<td>' . esc_html($st['tags'] ?? '') . '</td>';
        echo '<td>' . esc_html($st['language'] ?? '—') . '</td>';
        echo '<td>' . esc_html($st['bitrate'] ?? '—') . '</td>';
        echo '<td>' . esc_html($st['votes'] ?? '—') . '</td>';
        echo '<td>' . (!empty($st['is_active']) ? '<span class="ppa-badge ppa-badge-active">Aktív</span>' : '<span class="ppa-badge ppa-badge-inactive">Inaktív</span>') . '</td>';
        echo '<td style="text-align:center;">';
        if ($icy !== null) {
            echo $icy['has_meta'] ? '<span class="ppa-green">✅</span>' : '<span class="ppa-red">❌</span>';
        } else {
            $meta_url = add_query_arg(['ppaction' => 'check_single_meta', 'uuid' => $uuid], ppadmin_self_url());
            echo '<a href="' . esc_url($meta_url) . '" class="ppa-btn" style="padding:2px 8px;font-size:11px;">🔍</a>';
        }
        echo '</td>';
        echo '<td>';
        // Szerkesztés
        echo '<details class="ppa-details" style="margin-bottom:4px;"><summary class="ppa-btn" style="padding:4px 10px;font-size:12px;">Szerkesztés</summary>';
        echo '<form method="post" style="margin-top:8px;">';
        wp_nonce_field('ppadmin_radio_update');
        echo '<input type="hidden" name="pp_update_radio" value="1" />';
        echo '<input type="hidden" name="station_uuid" value="' . esc_attr($uuid) . '" />';
        echo '<label>Név:<br><input type="text" name="name" value="' . esc_attr($st['name'] ?? '') . '" class="ppa-input" style="width:280px;" /></label><br>';
        echo '<label>Stream URL:<br><input type="text" name="stream_url" value="' . esc_attr($st['stream_url'] ?? '') . '" class="ppa-input" style="width:280px;" /></label><br>';
        echo '<label>Logó URL:<br><input type="text" name="favicon" value="' . esc_attr($favicon) . '" class="ppa-input" style="width:280px;" /></label><br>';
        echo '<label>Címkék (vesszővel):<br><input type="text" name="tags" value="' . esc_attr($st['tags'] ?? '') . '" class="ppa-input" style="width:280px;" /></label><br>';
        echo '<label>Nyelv: <input type="text" name="language" value="' . esc_attr($st['language'] ?? '') . '" class="ppa-input" style="width:60px;" /></label> ';
        echo '<label>Ország: <input type="text" name="country" value="' . esc_attr($st['country'] ?? '') . '" class="ppa-input" style="width:60px;" /></label><br>';
        echo '<label><input type="checkbox" name="is_active"' . checked(!empty($st['is_active']), true, false) . ' /> Aktív</label><br>';
        echo '<button class="ppa-btn ppa-btn-primary" style="margin-top:6px;">Mentés</button>';
        echo '</form></details>';
        // Deaktiválás (egyenként)
        echo '<form method="post" class="ppa-inline">';
        wp_nonce_field('ppadmin_radio_delete');
        echo '<input type="hidden" name="pp_del_radio" value="1" />';
        echo '<input type="hidden" name="station_uuid" value="' . esc_attr($uuid) . '" />';
        echo '<button class="ppa-btn ppa-btn-danger" style="padding:4px 10px;font-size:12px;">Deaktiválás</button>';
        echo '</form>';
        echo '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';

    // Tömeges deaktiváló gomb + JS
    echo '<div style="margin-top:12px;">';
    echo '<button type="button" class="ppa-btn ppa-btn-danger" onclick="ppadminBatchDeactivate()">🗑 Kijelöltek deaktiválása</button>';
    echo '</div>';
    echo '<script type="text/javascript">
function ppadminToggleAll(src) {
  var cbs = document.querySelectorAll("input[name=\"uuids[]\"]");
  for (var i = 0; i < cbs.length; i++) { cbs[i].checked = src.checked; }
}
function ppadminBatchDeactivate() {
  var cbs = document.querySelectorAll("input[name=\"uuids[]\"]:checked");
  var uuids = [];
  for (var i = 0; i < cbs.length; i++) { uuids.push(cbs[i].value); }
  if (uuids.length === 0) { alert("Nincs kijelölve egyetlen rádió sem."); return; }
  if (!confirm("Deaktiválod a kijelölt " + uuids.length + " rádiót?")) return;
  var base = ' . json_encode($batch_base) . ';
  window.location.href = base + "&uuids=" + encodeURIComponent(uuids.join(","));
}
</script>';

    echo '<div style="margin-top:12px;">' . ppadmin_pagination($total, 50, $page, array_merge($keep, ['sort' => $sort, 'order' => $order])) . '</div>';
    echo '</div>';
}
