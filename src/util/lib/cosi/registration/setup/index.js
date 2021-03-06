"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require, camelcase */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const chalk = require("chalk");

const cosi = require(path.resolve(path.resolve(__dirname, "..", "..", "..", "cosi")));
const api = require(path.resolve(cosi.lib_dir, "api"));
const Broker = require(path.join(cosi.lib_dir, "broker"));
const Metrics = require(path.join(cosi.lib_dir, "metrics"));
const Registration = require(path.resolve(cosi.lib_dir, "registration"));
const TemplateFetcher = require(path.join(cosi.lib_dir, "template", "fetch"));

class Setup extends Registration {
    constructor(quiet) {
        super(quiet);

        this.regConfig = {
            broker: null,
            account: null,
            metricsFile: path.join(this.regDir, "setup-metrics.json"),
            cosiTags: [
                "cosi:install",
                `distro:${this.cosiAPI.args.dist}-${this.cosiAPI.args.vers}`,
                `arch:${this.cosiAPI.args.arch}`,
                `os:${this.cosiAPI.args.type}`
            ],
            cosiNotes: `cosi:register,cosi_id:${this.cosiId}`,
            templateData: {
                host_name: this.customOptions.host_name ? this.customOptions.host_name : os.hostname(),
                host_target: null,
                host_vars: this.customOptions.host_vars ? this.customOptions.host_vars : {},
                host_tags: this.customOptions.host_tags ? this.customOptions.host_tags : []
            }
        };

        this.regConfig.templateData.host_vars.num_cpus = os.cpus().length;

        this.metricGroups = [];

    }

    setup() {
        console.log(chalk.bold("Registration Setup"));

        const self = this;

        this.once("verify.api", this.verifyCirconusAPI);
        this.once("verify.api.done", () => {
            self.emit("default.target");
        });

        this.once("default.target", this.setTarget);
        this.once("default.target.done", () => {
            self.emit("metrics.fetch");
        });

        this.once("metrics.fetch", this.fetchNADMetrics);
        this.once("metrics.fetch.save", this.saveMetrics);
        this.once("metrics.fetch.done", () => {
            self.emit("templates.fetch");
        });

        this.once("templates.fetch", this.fetchTemplates);
        this.once("templates.fetch.done", () => {
            self.emit("verify.broker");
        });

        this.once("verify.broker", this.verifyBroker);
        this.once("verify.broker.done", () => {
            self.emit("save.config");
        });

        this.once("save.config", this.saveRegConfig);

        this.emit("verify.api");
    }

    verifyCirconusAPI() {
        console.log(chalk.blue(this.marker));
        console.log("Verify Circonus API access");

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.get("/account/current", null, (code, err, account) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            if (code !== 200) {
                self.emit("error", new Error(`verifyAPI - API return code: ${code} ${err} ${account}`));
            }

            console.log(chalk.green("API key verified"), "for account", account.name, account.description === null ? "" : `- ${account.description}`);

            let accountUrl = account._ui_base_url || "your_account_url";

            if (accountUrl.substr(-1) === "/") {
                accountUrl = accountUrl.substr(0, accountUrl.length - 1);
            }

            self.regConfig.account = {
                name: account.name,
                uiUrl: accountUrl
            };

            self.emit("verify.api.done");

        });
    }


    fetchNADMetrics() {
        console.log(chalk.blue(this.marker));
        console.log("Fetch available metrics from NAD");

        const self = this;
        const metrics = new Metrics(this.agentUrl);

        metrics.load((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }
            console.log(chalk.green("Metrics loaded"));
            metrics.getMetricStats((metricStatsError, stats) => {
                if (metricStatsError) {
                    self.emit("error", metricStatsError);
                }

                let totalMetrics = 0;

                for (const group in stats) {
                    if (stats.hasOwnProperty(group)) {
                        console.log(`\t ${group} has ${stats[group]} metrics`);
                        totalMetrics += stats[group];
                    }
                }

                console.log(`Total metrics: ${totalMetrics}`);
                this.emit("metrics.fetch.save", metrics);
            });
        });
    }


    saveMetrics(metrics) {
        assert.equal(typeof metrics, "object", "metrics is required");

        console.log("Saving available metrics");

        const self = this;

        metrics.getMetrics((metricsError, agentMetrics) => {
            if (metricsError) {
                self.emit("error", metricsError);
                return;
            }
            fs.writeFile(
                self.regConfig.metricsFile,
                JSON.stringify(agentMetrics, null, 4),
                { encoding: "utf8", mode: 0o600, flag: "w" },
                (saveError) => {
                    if (saveError) {
                        self.emit("error", saveError);
                        return;
                    }
                    console.log(chalk.green("Metrics saved", self.regConfig.metricsFile));
                    self.emit("metrics.fetch.done");
                }
            );
        });
    }


    fetchTemplates() {
        console.log(chalk.blue(this.marker));
        console.log("Fetching templates");

        const self = this;

        // DO NOT force in register, if templates have been provisioned, use them
        const templateFetch = new TemplateFetcher(false);

        templateFetch.all(this.quiet, (err, result) => {
            if (err) {
                self.emit("error", err);
                return;
            }
            console.log(`Checked ${result.attempts}, fetched ${result.fetched}, errors ${result.error}`);
            self.emit("templates.fetch.done");
        });
    }


    verifyBroker() {
        console.log(chalk.blue(this.marker));
        console.log("Verify Circonus broker");

        const self = this;
        const broker = new Broker(this.quiet);

        broker.getDefaultBroker((err, defaultBroker) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            self.regConfig.broker = defaultBroker;
            self.emit("verify.broker.done");
        });
    }


    saveRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log("Save registration configuration");

        const self = this;

        fs.writeFile(
            self.regConfigFile,
            JSON.stringify(this.regConfig, null, 4),
            { encoding: "utf8", mode: 0o644, flag: "w" },
            (saveError) => {
                if (saveError) {
                    self.emit("error", saveError);
                    return;
                }
                console.log(chalk.green("Registration configuration saved", self.regConfigFile));
                self.emit("setup.done");
                this.emit("metrics.fetch.done");
            }
        );
    }


    setTarget() {
        const self = this;

        console.log(chalk.blue(this.marker));
        console.log("Setting check target");

        if (cosi.hasOwnProperty("cosi_host_target") && cosi.cosi_host_target !== "") {
            console.log(chalk.green("Using target from command line:"), cosi.cosi_host_target);
            this.regConfig.templateData.host_target = cosi.cosi_host_target;
            this.emit("default.target.done");
        }
        else if (this.customOptions.hasOwnProperty("host_target") && this.customOptions.host_target) {
            console.log(chalk.green("Found custom host_target:"), this.customOptions.host_target);
            this.regConfig.templateData.host_target = this.customOptions.host_target;
            this.emit("default.target.done");
        }
        else if (this.agentMode.toLowerCase() === "reverse") {
             // this is what NAD will use to find the check to get reverse url
            console.log(chalk.green("Reverse agent"), "using", os.hostname());
            this.regConfig.templateData.host_target = os.hostname();
            this.emit("default.target.done");
        }
        else {
            this._getDefaultHostIp((target) => {
                console.log(chalk.green("Target ip/host:"), target);
                self.regConfig.templateData.host_target = target;
                self.emit("default.target.done");
            });
        }
    }


    _getDefaultHostIp(cb) {
        this._checkAWS((awsHostname) => {
            if (awsHostname !== null) {
                return cb(awsHostname);
            }

            console.log("Obtaining target IP/Host from local information");

            const networkInterfaces = os.networkInterfaces();

            for (const iface in networkInterfaces) {
                if (networkInterfaces.hasOwnProperty(iface)) {
                    // for (const addr of networkInterfaces[iface]) {
                    for (let i = 0; i < networkInterfaces[iface].length; i++) {
                        const addr = networkInterfaces[iface][i];

                        if (!addr.internal && addr.family === "IPv4") {
                            return cb(addr.address);
                        }
                    }
                }
            }

            return cb("0.0.0.0");
        });
    }

    _checkAWS(cb) { //eslint-disable-line consistent-return

        // ONLY make this request if dmiinfo contains 'amazon'
        // no reason to wait for a timeout otherwise
        if (!cosi.hasOwnProperty("dmi_bios_ver") || !cosi.dmi_bios_ver.match(/amazon/i)) {
            return cb(null);
        }

        console.log("Checking AWS for target (public ip/hostname for host)");

        // from aws docs: http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html
        http.get("http://169.254.169.254/latest/meta-data/public-hostname", (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                if (res.statusCode === 200) {
                    const hostnames = data.split(/\r?\n/); // or os.EOL but it's a web response not a file

                    if (hostnames.length > 0) {
                        return cb(hostnames[0]);
                    }
                    return cb(null);
                }
                return cb(null);
            });
        }).on("error", () => {
            // just punt, use the default "dumb" logic
            return cb(null);
        });
    }

}

module.exports = Setup;
