include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-easy-setup
PKG_VERSION:=2.0.1
PKG_RELEASE:=2
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Mahid
PKG_URL:=https://github.com/OppsError404/luci-app-easy-setup

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-easy-setup
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=Easy Setup LuCI Page
  DEPENDS:=+luci-base +rpcd-mod-iwinfo +ip-bridge
  PKGARCH:=all
endef

define Package/luci-app-easy-setup/description
  Easy Setup wizard for LuCI to configure WAN, Wi-Fi, and guest networks from a single page.
endef

LUCI_TMPL_DIR:=/usr/share/ucode/luci/template/easy_setup
PKG_STORE:=/usr/share/ucode/easy_setup
RPCD_UCODE_DIR:=/usr/share/rpcd/ucode
ES_VIEW_RES:=/www/luci-static/resources/view/easy_setup
LUCI_MENU_DIR:=/usr/share/luci/menu.d
RPCD_ACL_DIR:=/usr/share/rpcd/acl.d

define Build/Configure
endef

define Build/Compile
	# Use gzip -n for reproducible assets; init unpacks them into RAM.
	find $(PKG_BUILD_DIR)$(ES_VIEW_RES) \
		-type f ! -name '*.gz' -exec gzip -9n -kf {} +
endef

define Package/luci-app-easy-setup/install
	$(INSTALL_DIR) $(1)$(LUCI_TMPL_DIR) $(1)$(PKG_STORE) \
		$(1)$(RPCD_UCODE_DIR) $(1)$(ES_VIEW_RES) \
		$(1)$(LUCI_MENU_DIR) $(1)$(RPCD_ACL_DIR) $(1)/etc/init.d

	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(LUCI_TMPL_DIR)/*.ut $(1)$(LUCI_TMPL_DIR)/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(PKG_STORE)/*.uc $(1)$(PKG_STORE)/

	# Ship only the compressed assets.
	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(ES_VIEW_RES)/*.gz $(1)$(ES_VIEW_RES)/

	# Menu registration and ACL
	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(LUCI_MENU_DIR)/luci-app-easy-setup.json \
		$(1)$(LUCI_MENU_DIR)/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(RPCD_ACL_DIR)/luci-app-easy-setup.json \
		$(1)$(RPCD_ACL_DIR)/

	# Native rpcd ubus registration; business logic runs in an isolated worker.
	$(INSTALL_DATA) $(PKG_BUILD_DIR)$(RPCD_UCODE_DIR)/easy_setup.uc $(1)$(RPCD_UCODE_DIR)/

	$(INSTALL_BIN) $(PKG_BUILD_DIR)/etc/init.d/easy_setup \
		$(1)/etc/init.d/
endef

define Package/luci-app-easy-setup/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0

rm -f /tmp/luci-indexcache /tmp/luci-modulecache /tmp/luci-*cache* 2>/dev/null || true

if [ -f /etc/init.d/easy_setup.apk-new ]; then
	mv /etc/init.d/easy_setup.apk-new /etc/init.d/easy_setup
fi
if [ -f /etc/init.d/easy_setup.opkg-new ]; then
	mv /etc/init.d/easy_setup.opkg-new /etc/init.d/easy_setup
fi

# default_postinst handles boot enablement; restart reloads the RAM assets.
/etc/init.d/easy_setup restart 2>/dev/null || true

/etc/init.d/rpcd restart 2>/dev/null || true

exit 0
endef

define Package/luci-app-easy-setup/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
[ "$${PKG_UPGRADE}" = "1" ] && exit 0
[ "$$1" = "upgrade" ] && exit 0

# default_prerm has already stopped and disabled the service.
for asset in /www/luci-static/resources/view/easy_setup/*; do
    [ -L "$$asset" ] || continue
    if [ "$$(readlink "$$asset")" = "/tmp/luci-static/resources/view/easy_setup/$${asset##*/}" ]; then
        rm -f "$$asset"
    fi
done

rm -rf /tmp/easy_setup /tmp/luci-static/resources/view/easy_setup 2>/dev/null || true

rmdir /usr/share/ucode/luci/template/easy_setup 2>/dev/null || true
rmdir /usr/lib/lua/luci/easy_setup_pkg 2>/dev/null || true
rmdir /www/luci-static/resources/view/easy_setup 2>/dev/null || true

rm -f /tmp/luci-indexcache /tmp/luci-modulecache /tmp/luci-*cache* 2>/dev/null || true

/etc/init.d/rpcd restart 2>/dev/null || true

exit 0
endef

$(eval $(call BuildPackage,luci-app-easy-setup))
