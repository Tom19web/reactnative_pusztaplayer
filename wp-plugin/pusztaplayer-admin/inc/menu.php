<?php
/**
 * PusztaPlayer Admin — WordPress admin menü regisztráció.
 */

if (!defined('ABSPATH')) exit;

add_action('admin_menu', function () {
    add_menu_page(
        'PusztaPlayer Admin',
        'PusztaPlayer',
        'manage_options',
        'ppadmin',
        'ppadmin_page_dashboard',
        'dashicons-video-alt2',
        80
    );
    add_submenu_page('ppadmin', 'Irányítópult', 'Irányítópult', 'manage_options', 'ppadmin', 'ppadmin_page_dashboard');
    add_submenu_page('ppadmin', 'Logo Kezelő', 'Logo Kezelő', 'manage_options', 'ppadmin-logos', 'ppadmin_page_logos');
    add_submenu_page('ppadmin', 'EPG / Csatornák', 'EPG / Csatornák', 'manage_options', 'ppadmin-epg', 'ppadmin_page_epg');
    add_submenu_page('ppadmin', 'Címke Kezelő', 'Címke Kezelő', 'manage_options', 'ppadmin-tags', 'ppadmin_page_tags');
    add_submenu_page('ppadmin', 'Rádió Kezelő', 'Rádió Kezelő', 'manage_options', 'ppadmin-radio', 'ppadmin_page_radio');
    add_submenu_page('ppadmin', 'Docker Manager', 'Docker Manager', 'manage_options', 'ppadmin-docker', 'ppadmin_page_docker');
    add_submenu_page('ppadmin', 'Script Editor', 'Script Editor', 'manage_options', 'ppadmin-scripts', 'ppadmin_page_scripts');
    add_submenu_page('ppadmin', 'Beállítások', 'Beállítások', 'manage_options', 'ppadmin-settings', 'ppadmin_settings_page');
});
