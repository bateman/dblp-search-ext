.SHELL := /bin/bash
.SHELLARGS := -eu -c

APPNAME := dblpSearch
DEFAULT_URL ?= "https://scholar.google.com"

CSS := css
JS := js
IMAGES := images
HTML := html
MANIFEST := manifest.json
SRC := $(CSS) $(JS) $(IMAGES) $(HTML) $(MANIFEST)
SRC_FILES := $(shell find $(SRC) -type f)
JS_FILES := $(wildcard $(JS)/*.js)

WORK_DIR := $(shell pwd)
BUILD_DIR := $(WORK_DIR)/build

RELEASE_TIMESTAMP := .release.stamp
CHROME_BUILD_TIMESTAMP := .chrome.stamp
FIREFOX_BUILD_TIMESTAMP := .firefox.stamp
SAFARI_BUILD_TIMESTAMP := .safari.stamp

SAFARI_DEV_ID := dev.fcalefato.$(APPNAME)

.DEFAULT_GOAL := help

.PHONY: help clean tag/release tag/delete dep_macos dep_chrome dep_firefox dep_edge run/chrome run/edge run/firefox

#-- Help

help:  ## Show this help message
	@echo "\nUsage: make [target]\n"
	@grep -E '^[0-9a-zA-Z_-]+(/?[0-9a-zA-Z_-]*)*:.*?## .*$$|(^#--)' $(MAKEFILE_LIST) \
	| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m %-15s\033[0m %s\n", $$1, $$2}' \
	| sed -e 's/\[36m #-- /\[35m/'

#-- Build targets

build/firefox: $(FIREFOX_BUILD_TIMESTAMP)  ## Build Firefox addon XPI and JS sources
$(FIREFOX_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo "Building Firefox addon"
	$(eval version=$(shell jq -r .version manifest.json))
	mkdir -p $(BUILD_DIR)/firefox/src/$(APPNAME)-addon-$(version) > /dev/null
	# rename default manifest.json
	mv manifest.json manifest.json.tmp
	# create a new manifest.json for Firefox
	mv manifest.firefox.json manifest.json
	zip -r -FS $(BUILD_DIR)/firefox/$(APPNAME)-addon-$(version).xpi $(SRC) -x \*.DS_Store
	zip -r -FS $(BUILD_DIR)/firefox/$(APPNAME)-addon-$(version)-sources.zip $(JS_FILES)
	cp -r $(SRC) $(BUILD_DIR)/firefox/src/$(APPNAME)-addon-$(version)
	cp $(MANIFEST) $(BUILD_DIR)/firefox/src/$(APPNAME)-addon-$(version)
	# restore default manifest.json
	mv manifest.json manifest.firefox.json
	mv manifest.json.tmp manifest.json
	touch $(FIREFOX_BUILD_TIMESTAMP)

build/safari: $(SAFARI_BUILD_TIMESTAMP)  ## Build Safari app-extension
$(SAFARI_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo "Building Safari extension"
	$(eval version=$(shell jq -r .version manifest.json))
	mkdir -p $(BUILD_DIR)/safari > /dev/null
	mkdir -p $(BUILD_DIR)/safari/build > /dev/null
	mkdir -p $(BUILD_DIR)/safari/src > /dev/null
	mkdir -p $(BUILD_DIR)/safari/pkg > /dev/null
	cp manifest.json $(BUILD_DIR)/safari/src 
	cp -r html $(BUILD_DIR)/safari/src 
	cp -r images $(BUILD_DIR)/safari/src 
	cp -r js $(BUILD_DIR)/safari/src 
	cp -r css $(BUILD_DIR)/safari/src 
	xcrun safari-web-extension-converter $(BUILD_DIR)/safari/src --app-name "$(APPNAME)" --bundle-identifier "dev.fcalefato.$(APPNAME)" --project-location $(BUILD_DIR)/safari --no-prompt --no-open --force --macos-only
	#cd $(BUILD_DIR)/safari/$(APPNAME) && xcodebuild -scheme $(APPNAME) -archivePath $(BUILD_DIR)/safari/build/$(APPNAME).xcarchive build
	#cd $(BUILD_DIR)/safari/$(APPNAME) && xcodebuild archive -scheme $(APPNAME) -archivePath $(BUILD_DIR)/safari/build/$(APPNAME).xcarchive
	# cd $(BUILD_DIR)/safari/$(APPNAME) && xcodebuild -exportArchive -archivePath $(BUILD_DIR)/safari/build/$(APPNAME).xcarchive -exportPath $(BUILD_DIR)/safari/pkg/$(APPNAME).pkg -exportOptionsPlist ExportOptions.plist
	cd $(BUILD_DIR)/safari/$(APPNAME) &&  xcodebuild -target $(APPNAME) -configuration Release clean build
	#cd $(BUILD_DIR)/safari/$(APPNAME) &&  pkgbuild --root build/Release --identifier "$(SAFARI_DEV_ID)" --version $(version) ../pkg/$(APPNAME)-$(version).pkg
	zip $(BUILD_DIR)/safari/$(APPNAME)-appex-$(version).zip $(BUILD_DIR)/safari/$(APPNAME)/build/Release/$(APPNAME).app
	touch $(SAFARI_BUILD_TIMESTAMP)

build/chrome: $(CHROME_BUILD_TIMESTAMP)  ## Build Chrome extension zip
$(CHROME_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo "Building Chrome extension"
	$(eval version=$(shell jq -r .version manifest.json))
	mkdir -p $(BUILD_DIR)/chrome > /dev/null
	zip -r -FS $(BUILD_DIR)/chrome/$(APPNAME)-ext-$(version).zip $(SRC) -x \*.DS_Store
	touch $(CHROME_BUILD_TIMESTAMP)

build/clean:  # Clean up build directory and remove build timestamps
	@echo "Cleaning up $(BUILD_DIR) directory..."
	rm -rf $(BUILD_DIR)/firefox
	rm -rf $(BUILD_DIR)/safari
	rm -rf $(BUILD_DIR)/chrome
	rm -f $(FIREFOX_BUILD_TIMESTAMP)
	rm -f $(SAFARI_BUILD_TIMESTAMP)
	rm -f $(CHROME_BUILD_TIMESTAMP)

build/all:  ## Build all extensions
	$(MAKE) build/chrome 
	$(MAKE) build/firefox 
	$(MAKE) build/safari

#-- Update version

define update_version
	@echo "Bump version from $(version) to $(new_version)"
	# replace the version in manifest.json with the new version
	cat manifest.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.json
	# replace the version in manifest.firefox.json with the new version
	cat manifest.firefox.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.firefox.json
	touch $(RELEASE_TIMESTAMP)
endef

update/patch:  ## Bump patch version in manifest*.json
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the patch version (e.g., 1.0.0 -> 1.0.1)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$NF++; print $$0}'))
	$(call update_version)

update/minor:  ## Bump minor version in manifest*.json
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the minor version (e.g., 1.0.0 -> 1.1.0)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$(NF-1)++; $$NF=0; print $$0}'))
	$(call update_version)

update/major:  ## Bump major version in manifest*.json
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the major version (e.g., 1.0.0 -> 2.0.0)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$1++; $$2=0; $$3=0; print $$0}'))
	$(call update_version)

#-- Tagging

tag/release: $(RELEASE_TIMESTAMP) ## Tag the current version and push to origin
$(RELEASE_TIMESTAMP): $(MANIFEST)
	$(eval version=$(shell jq -r .version manifest.json))
	git tag $(version)
	git push origin $(version)

tag/delete:  ## Delete the tag for the current version
	$(eval version=$(shell jq -r .version manifest.json))
	$(eval tag_exists=$(shell git rev-parse $(version) >/dev/null 2>&1 && echo 1 || echo 0))
	@if [ "$(tag_exists)" = "1" ]; then \
		echo "Deleting tag $(version)"; \
		git tag -d $(version) 2>/dev/null && git push origin :refs/tags/$(version); \
	else \
		echo "Current $(version) is not tagged"; \
	fi

#-- Run

dep_macos:
	@echo "Checking if OS is MacOS..."
	@uname -s | grep "Darwin" || "echo 'Run targets are only available on MacOS.'"

dep_chrome: dep_macos
	@echo "Checking if Google Chrome is installed..."
	@ls /Applications | grep "Google Chrome.app" || "echo 'Google Chrome is not installed.'"

dep_firefox: dep_macos
	@echo "Checking if Firefox Developer Edition is installed..."
	@ls /Applications | grep "Firefox Developer Edition.app" || "echo 'Firefox Developer Edition is not installed.'"
	@echo "Checking if web-ext is installed..."
	@web-ext --version || "echo 'web-ext is not installed'."

dep_edge: dep_macos
	@echo "Checking if Microsoft Edge is installed..."
	@ls /Applications | grep "Microsoft Edge.app" || "echo 'Microsoft Edge is not installed.'"

run/chrome: dep_chrome  ## Run Chrome extension in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo "Running Chrome extension (make sure Chrome is not already running)."
	@open -a "Google Chrome" --args \
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

run/edge: dep_edge   ## Run Edge extension (use DEFAULT_URL="..." to set the opening page)
	@echo "Opening Edge browser (Make sure Edge is not already running. Note: Edge does not support development mode for extensions)."
	@open -a "Microsoft Edge" --args \
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

run/firefox: dep_firefox build/firefox ## Run Firefox addon in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo "Running Firefox addon"
	$(eval version=$(shell jq -r .version manifest.firefox.json))
	@cd $(BUILD_DIR)/firefox/src && web-ext run --firefox="/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox" \
		--source-dir=$(APPNAME)-addon-$(version) \
		--start-url=$(DEFAULT_URL)