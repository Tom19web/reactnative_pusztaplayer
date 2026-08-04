<?php
/**
 * PusztaPlayer Admin — Dark UI CSS betöltése.
 */

if (!defined('ABSPATH')) exit;

add_action('admin_enqueue_scripts', function ($hook) {
    if (strpos($hook, 'ppadmin') !== false) {
        wp_enqueue_style(
            'ppadmin-ui',
            PPADMIN_PLUGIN_URL . 'assets/admin.css',
            [],
            PPADMIN_VERSION
        );
    }
});
