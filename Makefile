CP=cp -dpr --no-preserve=ownership 

all: npm-deps

.PHONY: npm-deps
npm-deps:
	npm install


.PHONY: dist-clean
dist-clean:
	@rm -rf node_modules
	@rm -rf client/js/bower


.PHONY: install
install: install_user install_directories install_share install_bin install_platform

.PHONY: install_user
install_user:
	if ! grep -q nestor /etc/passwd; then adduser --system --no-create-home nestor; addgroup --system nestor; adduser nestor nestor; fi

.PHONY: install_directories
install_directories:
	install -d /usr/share/nestor
	install -d /etc/nestor
	install -d -o nestor -g nestor -m 0775 /var/log/nestor
	install -d -o nestor -g nestor -m 0775 /var/lib/nestor/tmp
	install -d -o nestor -g nestor -m 0775 /var/lib/nestor/media

.PHONY: install_share
install_share:
	$(CP) client node_modules server nestor.js /usr/share/nestor

.PHONY: install_bin
install_bin:
	install -m 0755 nestor /usr/bin

.PHONY: install_platform
install_platform:
	install -m 0644 platform/config.json /etc/nestor
	install -m 0644 platform/nestor.conf /etc/init


.PHONY: uninstall
uninstall: uninstall_bin uninstall_directories uninstall_user

.PHONY: uninstall_user
uninstall_user:
	deluser nestor
	delgroup nestor

.PHONY: uninstall_directories
uninstall_directories:
	rm -rf /usr/share/nestor
	rm -rf /etc/nestor
	rm -rf /var/log/nestor
	rm -rf /var/lib/nestor

.PHONY: uninstall_bin
uninstall_bin:
	rm /usr/bin/nestor

.PHONY: uninstall_platform
uninstall_platform:
	rm /etc/init/nestor.conf
