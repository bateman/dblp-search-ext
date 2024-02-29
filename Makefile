SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

APPNAME := dblpSearch
MANIFEST := manifest.json
MANIFEST_FIREFOX := manifest.firefox.json
MANIFEST_TMP := manifest.json.tmp
VERSION := $(shell jq -r .version $(MANIFEST))
DEFAULT_URL ?= "https://scholar.google.com"

WORK_DIR := $(CURDIR)
BUILD_DIR := $(WORK_DIR)/build
SAFARI_DIR := safari
CHROME_DIR := chrome
FIREFOX_DIR := firefox
CSS := css
JS := js
IMAGES := images
HTML := html

SRC := $(CSS) $(JS) $(IMAGES) $(HTML) $(MANIFEST)
SRC_FILES := $(shell find $(SRC) -type f)
JS_FILES := $(wildcard $(JS)/*.js)

RELEASE_TIMESTAMP := .release.stamp
CHROME_BUILD_TIMESTAMP := .chrome.stamp
FIREFOX_BUILD_TIMESTAMP := .firefox.stamp
SAFARI_BUILD_TIMESTAMP := .safari.stamp

SAFARI_DEV_ID := dev.fcalefato.$(APPNAME)

CHROME_APP := Google Chrome.app
FIREFOX_APP := Firefox Developer Edition.app
EDGE_APP := Microsoft Edge.app
SAFARI_APP := Safari.app

.DEFAULT_GOAL := help

RESET := \033[0m
RED := \033[0;31m
GREEN := \033[0;32m
ORANGE := \033[0;33m
MAGENTA := \033[0;35m
CYAN := \033[0;36m

#-- Help

.PHONY: help
help:  ## Show this help message
	@echo -e "\nUsage: make [target]\n"
	@grep -E '^[0-9a-zA-Z_-]+(/?[0-9a-zA-Z_-]*)*:.*?## .*$$|(^#--)' $(MAKEFILE_LIST) \
	| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m %-15s\033[0m %s\n", $$1, $$2}' \
	| sed -e 's/\[36m #-- /\[35m/'

#-- Build targets

build/firefox: $(FIREFOX_BUILD_TIMESTAMP)  ## Build Firefox addon XPI and sources
$(FIREFOX_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo -e "$(CYAN)\nBuilding Firefox addon...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APPNAME)-addon-$(VERSION) > /dev/null
	@mv $(MANIFEST) $(MANIFEST_TMP)
	@mv $(MANIFEST_FIREFOX) $(MANIFEST)
	@zip -r -FS $(BUILD_DIR)/$(FIREFOX_DIR)/$(APPNAME)-addon-$(VERSION).xpi $(SRC) -x \*.DS_Store
	@zip -r -FS $(BUILD_DIR)/$(FIREFOX_DIR)/$(APPNAME)-addon-$(VERSION)-sources.zip $(JS_FILES)
	@cp -r $(SRC) $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APPNAME)-addon-$(VERSION)
	@cp $(MANIFEST) $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APPNAME)-addon-$(VERSION)
	@mv $(MANIFEST) $(MANIFEST_FIREFOX)
	@mv $(MANIFEST_TMP) $(MANIFEST)
	@touch $(FIREFOX_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

build/safari: dep/macos $(SAFARI_BUILD_TIMESTAMP)  ## Build Safari app-extension
$(SAFARI_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo -e "$(CYAN)\nBuilding Safari app extension...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR) > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/build > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/src > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/pkg > /dev/null
	@cp $(MANIFEST) $(BUILD_DIR)/$(SAFARI_DIR)/src 
	@cp -r $(HTML) $(BUILD_DIR)/$(SAFARI_DIR)/src 
	@cp -r $(IMAGES) $(BUILD_DIR)/$(SAFARI_DIR)/src 
	@cp -r $(JS) $(BUILD_DIR)/$(SAFARI_DIR)/src 
	@cp -r $(CSS) $(BUILD_DIR)/$(SAFARI_DIR)/src 
	@xcrun safari-web-extension-converter $(BUILD_DIR)/$(SAFARI_DIR)/src --app-name "$(APPNAME)" --bundle-identifier "dev.fcalefato.$(APPNAME)" --project-location $(BUILD_DIR)/$(SAFARI_DIR) --no-prompt --no-open --force --macos-only
	#cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME) && xcodebuild -scheme $(APPNAME) -archivePath $(BUILD_DIR)/$(SAFARI_DIR)/build/$(APPNAME).xcarchive build
	#cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME) && xcodebuild archive -scheme $(APPNAME) -archivePath $(BUILD_DIR)/$(SAFARI_DIR)/build/$(APPNAME).xcarchive
	#cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME) && xcodebuild -exportArchive -archivePath $(BUILD_DIR)/$(SAFARI_DIR)/build/$(APPNAME).xcarchive -exportPath $(BUILD_DIR)/$(SAFARI_DIR)/pkg/$(APPNAME).pkg -exportOptionsPlist ExportOptions.plist
	@cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME) &&  xcodebuild -target $(APPNAME) -configuration Release clean build
	#cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME) &&  pkgbuild --root build/Release --identifier "$(SAFARI_DEV_ID)" --version $(VERSION) ../pkg/$(APPNAME)-$(VERSION).pkg
	@zip $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME)-appex-$(VERSION).zip $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME)/build/Release/$(APPNAME).app
	@touch $(SAFARI_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

build/chrome: $(CHROME_BUILD_TIMESTAMP)  ## Build Chrome extension zip
$(CHROME_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo -e "$(CYAN)\nBuilding Chrome extension...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(CHROME_DIR) > /dev/null
	@zip -r -FS $(BUILD_DIR)/$(CHROME_DIR)/$(APPNAME)-ext-$(VERSION).zip $(SRC) -x \*.DS_Store
	@touch $(CHROME_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done$(RESET)"

buid/edge:  ## Build Edge extension zip (same as Chrome)
	$(MAKE) build/chrome

.PHONY: clean
build/clean:  # Clean up build directory and remove build timestamps
	@echo -e "$(CYAN)\nCleaning up $(BUILD_DIR) directory...$(RESET)"
	@rm -rf $(BUILD_DIR)/$(FIREFOX_DIR)
	@rm -rf $(BUILD_DIR)/$(SAFARI_DIR)
	@rm -rf $(BUILD_DIR)/$(CHROME_DIR)
	@rm -f $(FIREFOX_BUILD_TIMESTAMP)
	@rm -f $(SAFARI_BUILD_TIMESTAMP)
	@rm -f $(CHROME_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

build/all:  ## Build all extensions
	@echo -e "$(CYAN)\nBuilding all extensions...$(RESET)"
	$(MAKE) build/chrome 
	$(MAKE) build/firefox 
	$(MAKE) build/safari

#-- Update version

define update_version
	@echo -e "$(CYAN)\nBump version from $(VERSION) to $(new_version).$(RESET)"
	@cat $(MANIFEST) | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > $(MANIFEST_TMP)
	@mv $(MANIFEST_TMP) $(MANIFEST)
	@cat $(MANIFEST_FIREFOX) | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > $(MANIFEST_TMP)
	@mv $(MANIFEST_TMP) $(MANIFEST_FIREFOX)
	@touch $(RELEASE_TIMESTAMP)
endef

update/patch:  ## Bump patch semantic version in manifest files (e.g., 1.0.0 -> 1.0.1)
	$(eval new_version=$(shell echo $(VERSION) | awk -F. -v OFS=. '{$$NF++; print $$0}'))
	$(call update_version)

update/minor:  ## Bump minor semantic version in manifest files (e.g., 1.0.0 -> 1.1.0)
	$(eval new_version=$(shell echo $(VERSION) | awk -F. -v OFS=. '{$$(NF-1)++; $$NF=0; print $$0}'))
	$(call update_version)

update/major:  ## Bump major semantic version in manifest files (e.g., 1.0.0 -> 2.0.0)
	$(eval new_version=$(shell echo $(VERSION) | awk -F. -v OFS=. '{$$1++; $$2=0; $$3=0; print $$0}'))
	$(call update_version)

#-- Tagging

.PHONY: tag/release 
tag/release: $(RELEASE_TIMESTAMP) ## Tag the current version and push to origin
$(RELEASE_TIMESTAMP): $(MANIFEST)
	@echo -e "$(CYAN)\nTagging version $(VERSION) and pushing to origin...$(RESET)"
	@git tag $(VERSION)
	@git push origin $(VERSION)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: tag/delete 
tag/delete:  ## Delete the tag for the current version
	$(eval tag_exists=$(shell git rev-parse $(VERSION) >/dev/null 2>&1 && echo 1 || echo 0))
	@if [ "$(tag_exists)" = "1" ]; then \
		@echo -e "$(CYAN)\nDeleting tag $(VERSION).$(RESET)"; \
		git tag -d $(VERSION) 2>/dev/null && git push origin :refs/tags/$(VERSION); \
	else \
		@echo -e "$(ORANGE)Current $(VERSION) is not tagged.$(RESET)"; \
	fi

#-- Run

.PHONY: dep/xcode
dep/xcode:
	@echo -e "$(CYAN)\nChecking if Xcode is installed...$(RESET)"
	@xcode-select -p || "echo 'Xcode is not installed.'"

.PHONY: dep/macos
dep/macos:
	@echo -e "$(CYAN)\nChecking if OS is MacOS...$(RESET)"
	@uname -s | grep "Darwin" || "echo 'Run targets are only available on MacOS.'"

.PHONY: dep/chrome
dep/chrome: dep/macos
	@echo -e "$(CYAN)\nChecking if Google Chrome is installed...$(RESET)"
	@ls /Applications | grep -x "$(CHROME_APP)" || echo -e "$(RED)Google Chrome is not installed.$(RESET)"

.PHONY: dep/firefox
dep/firefox: dep/macos
	@echo -e "$(CYAN)\nChecking if Firefox Developer Edition is installed...$(RESET)"
	@ls /Applications | grep -x "$(FIREFOX_APP)" || echo -e "$(RED)Firefox Developer Edition is not installed.$(RESET)"
	@echo -e "$(CYAN)\nChecking if web-ext is installed...$(RESET)"
	@web-ext --version || echo -e "$(RED)web-ext is not installed.$(RESET)"

.PHONY: dep/edge
dep/edge: dep/macos
	@echo -e "$(CYAN)\nChecking if Microsoft Edge is installed...$(RESET)"
	@ls /Applications | grep -x "$(EDGE_APP)" || echo -e "$(RED)Microsoft Edge is not installed.$(RESET)"

.PHONY:  dep/safari
dep/safari: dep/macos
	@echo -e "$(CYAN)\nChecking if Safari is installed...$(RESET)"
	@ls /Applications | grep -x "$(SAFARI_APP)" || echo -e "$(RED)Safari is not installed.$(RESET)"

.PHONY: run/chrome
run/chrome: dep/chrome  ## Run Chrome extension in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Chrome extension...$(RESET)"
	@echo -e "${ORANGE}Make sure Chrome is not already running.${RESET}"
	@open -a "$(CHROME_APP)" --args \
		--auto-open-devtools-for-tabs \
		--force-dev-mode-highlighting \
		--no-first-run \
		--no-default-browser-check \
		--disable-sync \
		--disable-default-apps \
		--disable-client-side-phishing-detection \
		--disable-background-networking \
		--disable-background-timer-throttling \
		--disable-backgrounding-occluded-windows \
		--disable-breakpad \
		--disable-dev-shm-usage \
		--disable-renderer-backgrounding \
		--metrics-recording-only \
		--load-extension=$(WORK_DIR) \
		$(DEFAULT_URL)

.PHONY: run/edge
run/edge: dep/edge   ## Run Edge extension (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nOpening Edge extension...$(RESET)"
	@echo -e "${ORANGE}Make sure Edge is not already running. (Note: Edge does not support development mode for extensions).${RESET}"
	@open -a "$(EDGE_APP)" --args \
		--force-dev-mode-highlighting \
		--no-first-run \
		--no-default-browser-check \
		--disable-sync \
		--disable-default-apps \
		--disable-client-side-phishing-detection \
		--disable-background-networking \
		--disable-background-timer-throttling \
		--disable-backgrounding-occluded-windows \
		--disable-breakpad \
		--disable-dev-shm-usage \
		--disable-renderer-backgrounding \
		--metrics-recording-only \
		--load-extension=$(WORK_DIR) \
		$(DEFAULT_URL)

.PHONY: run/firefox
run/firefox: dep/firefox build/firefox ## Run Firefox addon in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Firefox addon...$(RESET)"
	@cd $(BUILD_DIR)/$(FIREFOX_DIR)/src && web-ext run --firefox="/Applications/$(FIREFOX_APP)/Contents/MacOS/firefox" \
		--source-dir=$(APPNAME)-addon-$(VERSION) \
		--start-url=$(DEFAULT_URL)

.PHONY: run/safari
run/safari: dep/safari build/safari  ## Run Safari app-extension 
	@echo -e "$(CYAN)\nRunning Safari app-extension...$(RESET)"
	@echo -e "${ORANGE}Note that the extension is not signed, you need to go to 'Settings' > Select 'Developer' tab > Check the 'Allow unsigned extensions' box.${RESET}"
	@open -a $(BUILD_DIR)/$(SAFARI_DIR)/$(APPNAME)/build/Release/$(APPNAME).app