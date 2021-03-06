'use strict'
exports.start = startMetrics
exports.stop = stopMetrics
exports.save = saveMetrics
exports.send = sendMetrics

var fs = require('fs')
var path = require('path')
var npm = require('../npm.js')
var uuid = require('uuid')

var inMetrics = false

function startMetrics () {
  if (inMetrics) return
  // loaded on demand to avoid any recursive deps when `./metrics-launch` requires us.
  var metricsLaunch = require('./metrics-launch.js')
  npm.metricsProcess = metricsLaunch()
}

function stopMetrics () {
  if (inMetrics) return
  if (npm.metricsProcess) npm.metricsProcess.kill('SIGKILL')
}

function saveMetrics (itWorked) {
  if (inMetrics) return
  // If the metrics reporter hasn't managed to PUT yet then kill it so that it doesn't
  // step on our updating the anonymous-cli-metrics json
  stopMetrics()
  var metricsFile = path.join(npm.config.get('cache'), 'anonymous-cli-metrics.json')
  var metrics
  try {
    metrics = JSON.parse(fs.readFileSync(metricsFile))
    metrics.metrics.to = new Date().toISOString()
    if (itWorked) {
      ++metrics.metrics.successfulInstalls
    } else {
      ++metrics.metrics.failedInstalls
    }
  } catch (ex) {
    metrics = {
      metricId: uuid.v4(),
      metrics: {
        from: new Date().toISOString(),
        to: new Date().toISOString(),
        successfulInstalls: itWorked ? 1 : 0,
        failedInstalls: itWorked ? 0 : 1
      }
    }
  }
  try {
    fs.writeFileSync(metricsFile, JSON.stringify(metrics))
  } catch (ex) {
    // we couldn't write the error metrics file, um, well, oh well.
  }
}

function sendMetrics (metricsFile, metricsRegistry) {
  inMetrics = true
  var cliMetrics = JSON.parse(fs.readFileSync(metricsFile))
  npm.load({}, function (err) {
    if (err) return
    npm.registry.config.retry.retries = 0
    npm.registry.sendAnonymousCLIMetrics(metricsRegistry, cliMetrics, function (err) {
      if (err) {
        fs.writeFileSync(path.join(path.dirname(metricsFile), 'last-send-metrics-error.txt'), err.stack)
      } else {
        fs.unlinkSync(metricsFile)
      }
    })
  })
}
