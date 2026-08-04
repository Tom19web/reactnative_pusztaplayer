<?php
/**
 * Plugin Name: PusztaPlayer Admin
 * Plugin URI: https://pusztaplay.eu
 * Description: Webes admin felület a PusztaPlayer backend menedzseléséhez. Tiszta PHP megvalósítás.
 * Version: 2.0.0
 * Author: PusztaPlayer
 */

if (!defined('ABSPATH')) exit;

define('PPADMIN_VERSION', '2.0.0');
define('PPADMIN_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PPADMIN_PLUGIN_URL', plugin_dir_url(__FILE__));
define('PPADMIN_INC_DIR', PPADMIN_PLUGIN_DIR . 'inc/');
define('PPADMIN_PAGES_DIR', PPADMIN_INC_DIR . 'pages/');

// Modulok betöltése
require_once PPADMIN_INC_DIR . 'helpers.php';
require_once PPADMIN_INC_DIR . 'menu.php';
require_once PPADMIN_INC_DIR . 'enqueue.php';
require_once PPADMIN_INC_DIR . 'shortcode.php';

require_once PPADMIN_PAGES_DIR . 'dashboard.php';
require_once PPADMIN_PAGES_DIR . 'logos.php';
require_once PPADMIN_PAGES_DIR . 'epg.php';
require_once PPADMIN_PAGES_DIR . 'tags.php';
require_once PPADMIN_PAGES_DIR . 'radio.php';
require_once PPADMIN_PAGES_DIR . 'docker.php';
require_once PPADMIN_PAGES_DIR . 'scripts.php';
require_once PPADMIN_PAGES_DIR . 'settings.php';

// Deaktiváláskor cleanup
register_deactivation_hook(__FILE__, function () {
    delete_option('ppadmin_last_task');
});
