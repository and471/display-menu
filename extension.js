const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;

let _;
let settings, metadata;
let disperMenu, errorMessage, disperSystemMenuItem;

function init(extension) {
    const Convenience = extension.imports.convenience;
    Convenience.initTranslations();
    _ = Gettext.domain(extension.metadata['gettext-domain']).gettext;
    settings = Convenience.getSettings();
    metadata = {
        name: extension.metadata.name,
        path: extension.path
    };
}

function enable() {
    let indicator = true


    // Decide whether to show in the system indicator or a separate panel button
    if (indicator) {

        disperSystemMenuItem = new DisperSystemMenuItem()
        populateMenu(disperSystemMenuItem.menu)

    } else {

        disperMenu = new DisperMenu();
        populateMenu(disperMenu)


        let role = settings.get_string('role');
        Main.panel.addToStatusArea(role, disperMenu);
    }

}

function disable() {
    if (disperMenu) disperMenu.destroy();
    if (isperSystemMenuItem) disperSystemMenuItem.destroy()
    disperMenu = null;
    disperSystemMenuItem = null;
}



function hideMessage(message) {
    Main.uiGroup.remove_actor(message);
    message = null;
}

function showMessage(message, messageText) {
    if (!message) {
        message = new St.Label({
            style_class: 'message-label',
            text: messageText.trim()
        });
        Main.uiGroup.add_actor(message);
    }
    message.opacity = 255;
    let monitor = Main.layoutManager.primaryMonitor;
    message.set_position(Math.floor(monitor.width / 2 - message.width / 2),
        Math.floor(monitor.height / 2 - message.height / 2));
    Tweener.addTween(message, {
        opacity: 0,
        time: settings.get_int('message-fade-out-time'),
        transition: 'easeOutQuad',
        onComplete: hideMessage,
        onCompleteParams: [message]
    });
}

function populateMenu(menu) {

    actionsSingle = {
        'primary': _('Laptop screen only'),
        'secondary': _('External screen only')
    };

    actionsOther = {
        'clone': _('Duplicate'),
        'extend': _('Extend'),
    };

    commands = buildCommands();

    addDisperMenuItemsToMenu(menu, actionsSingle, commands);
    addDisperMenuItemsToMenu(menu, actionsOther, commands);
}

function addDisperMenuItemsToMenu(menu, actions, commands) {
    for (let action in actions) {
        let text = actions[action];
        let command = commands[action];
        let menuItem = new DisperMenuItem(text, action, command);
        menu.addMenuItem(menuItem);
    }
}

function buildCommands() {
    let commands = [];
    let useBelowSettings = settings.get_boolean('use-below-settings');
    let scalingMode = settings.get_string('scaling-mode');
    let extendDirection = settings.get_string('extend-direction');
    let disper = ['disper'];
    let actions = {
        primary: '-S',
        secondary: '-s',
        clone: '-c',
        extend: '-e',
    };
    let options = {
        scalingMode: '--scaling=',
        extendDirection: '--direction='
    };
    for (let action in actions) {
        let command = disper.slice(0);
        command.push(actions[action]);
        if (useBelowSettings) {
            command.push(options.scalingMode + scalingMode);
            if (action == 'extend') {
                command.push(options.extendDirection + extendDirection);
            }
        }
        commands.push(command);
    }
    let result = {};
    let i = 0;
    for (let action in actions) {
        result[action] = commands[i++].join(' ');
    }
    return result;
}


const LabelMenuItem = new Lang.Class({
    Name: 'LabelMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (text) {
        this.parent();
        let label = new St.Label({
            text: text
        });
        this.actor.add(label);
        this.actor.label_actor = label;
    }
});

const DisperMenuItem = new Lang.Class({
    Name: 'DisperMenuItem',
    Extends: LabelMenuItem,

    _init: function (text, action, command) {
        this.parent(text);
        this.connect('activate', function () {
            try {
                let [result, stdout, stderr] = GLib.spawn_command_line_sync(command);
                let message = stderr.toString();
                if (message != '') {
                    showMessage(errorMessage, message);
                }
            } catch (error) {
                let message = error.message;
                if (message != '') {
                    log('Disper Menu error: ' + message);
                    showMessage(errorMessage, _('Disper not found or other error'));
                }
            }
        });
    }
});

const DisperMenu = new Lang.Class({
    Name: 'DisperMenu',
    Extends: PanelMenu.Button,

    _init: function () {
        this._menuAlignment = 0.0;
        this.parent(this._menuAlignment, metadata.name);
        this._settingsId = settings.connect('changed', Lang.bind(this, this._reload));
        
        let hbox = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });
        let icon = new St.Icon({
            gicon: new Gio.FileIcon({
                file: Gio.File.new_for_path(metadata.path + '/images/disper-menu.svg')
            }),
            style_class: 'system-status-icon'
        });
        hbox.add_child(icon);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);
        this._reload();
    },


    destroy: function () {
        settings.disconnect(this._settingsId);
        this.parent();
    },

    _reload: function () {
        this.commands = this._buildCommands();
    }
});

const DisperSystemMenuItem = new Lang.Class({
    Name: 'DisperSystemMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function() {
        this.parent('Displays', true);
        this.icon.icon_name = "video-display-symbolic";

        this._control = Main.panel.statusArea.aggregateMenu._system._control;
        this._devices = {};

        let menu = Main.panel.statusArea.aggregateMenu.menu;
        let menuItems = menu._getMenuItems();

        let power = Main.panel.statusArea.aggregateMenu._power

        // Add menuitem after power indicator
        let i=0;
        for (; i < menuItems.length; i++) {
            if (menuItems[i] === power.menu) {
                break;
            }
        }
        menu.addMenuItem(this, i+1);
    },


    destroy: function() {
        this.parent();
    }
});