<?php
/**
 * PusztaPlayer Admin — Beállítások oldal.
 */

if (!defined('ABSPATH')) exit;

function ppadmin_settings_page() {
    if (!current_user_can('manage_options')) return;

    if (isset($_POST['ppadmin_save'])) {
        check_admin_referer('ppadmin_save');
        update_option('ppadmin_api_base', esc_url_raw($_POST['api_base']));
        update_option('ppadmin_auth_user', sanitize_text_field($_POST['auth_user']));
        update_option('ppadmin_auth_pass', sanitize_text_field($_POST['auth_pass']));
        update_option('ppadmin_page_slug', sanitize_title($_POST['page_slug']));
        update_option('ppadmin_admin_pass', sanitize_text_field($_POST['admin_pass']));
        echo '<div class="ppa-notice ppa-notice-success"><p>Beállítások mentve.</p></div>';
    }

    $cfg = ppadmin_get_credentials();
    ?>
    <div class="wrap">
        <h1>PusztaPlayer Admin Beállítások</h1>
        <div class="ppa-box">
            <form method="post">
                <?php wp_nonce_field('ppadmin_save'); ?>
                <table class="form-table">
                    <tr>
                        <th>Backend API URL</th>
                        <td><input type="url" name="api_base" value="<?php echo esc_attr($cfg['api_base']); ?>" class="ppa-input regular-text" /></td>
                    </tr>
                    <tr>
                        <th>Backend felhasználó</th>
                        <td><input type="text" name="auth_user" value="<?php echo esc_attr($cfg['auth_user']); ?>" class="ppa-input regular-text" /></td>
                    </tr>
                    <tr>
                        <th>Backend jelszó</th>
                        <td><input type="password" name="auth_pass" value="<?php echo esc_attr($cfg['auth_pass']); ?>" class="ppa-input regular-text" /></td>
                    </tr>
                    <tr>
                        <th>Frontend oldal slug</th>
                        <td><input type="text" name="page_slug" value="<?php echo esc_attr($cfg['page_slug']); ?>" class="ppa-input regular-text" /></td>
                    </tr>
                    <tr>
                        <th>Admin panel belépési jelszó</th>
                        <td><input type="password" name="admin_pass" value="<?php echo esc_attr($cfg['admin_pass']); ?>" class="ppa-input regular-text" /></td>
                    </tr>
                </table>
                <p class="submit"><button type="submit" name="ppadmin_save" class="ppa-btn ppa-btn-primary">Mentés</button></p>
            </form>
        </div>
    </div>
    <?php
}
