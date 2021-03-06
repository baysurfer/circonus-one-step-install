### 0.7.1 2016-06-14

* new: NAD reverse support (--agent reverse) for OmniOS
* change: default examples to reverse agent

### 0.7.0 2016-06-14

* new: NAD reverse support (--agent reverse) for Linux
* new: Ubuntu 16.04 support
* fix: typo '%' removed from metric name in graph-if
* new: upstream NAD version release 20160607T194451Z-1

### 0.6.0 2016-06-02

* new: honor https_proxy environment setting

### 0.5.0 2016-05-28

* new: add redhat 7.2 x86_64
* -: add versioned cosi-site deployments (for rollback)
* -: ignore versioned cosi-site tgz files
* -: make rpm building part of main package build
* new: re-add --target and --broker command line options.
* -: verify osi-site bin directory
* fix: limit enterprise brokers to "active" only, do not include "provisioned"

### 0.4.0 2016-05-20

* new: add omnios
* new: add vm specific provisioner override (e.g. omnios using shell while others using puppet)
* new: annotate vm specific provisioner setting in example config

### 0.3.0 2016-05-11

 * fix: os detection fix for centos 5
 * fix: typo in init.d script (centos 5)
 * fix: ui urls using api paths  
 * new: site endpoint to serve RPM /install/rpm
 * new: ruleset support (cosi rulesets -h)
 * change: examples separating into basic and advanced
