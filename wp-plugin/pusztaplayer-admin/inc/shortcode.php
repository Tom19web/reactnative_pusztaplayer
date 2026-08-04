<?php
/**
 * PusztaPlayer Admin — backwards-compat shortcode.
 * A régi [pusztaplayer_admin] shortcode-dal létrehozott oldalak továbbra is
 * használhatók: gombot adnak az új admin panelhez.
 */

if (!defined('ABSPATH')) exit;

add_shortcode('pusztaplayer_admin', function () {
    if (!current_user_can('manage_options')) return '';
    $url = admin_url('admin.php?page=ppadmin');
    return '<p><a href="' . esc_url($url) . '" class="button button-primary button-hero">🚀 PusztaPlayer Admin megnyitása</a></p>';
});
