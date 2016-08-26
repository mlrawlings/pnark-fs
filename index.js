var path = require('path')
var instrumitter = require('instrumitter')
var httpEvents = instrumitter('fs').watch('readFile', 'readFileSync', 'createReadStream').on('createReadStream:return', fn => {
    fn.return.value.on('end', () => {
        fn.end = {
            elapsed:instrumitter.time() - fn.time
        }
    })
})


module.exports = pnark => {
    pnark.addReporter('fs:read', fsReporter)
}

var fsReporter = report => {
    report.title('fs')
    Promise.all([
        report.collect(httpEvents, 'readFile', { stack:true, callback:true }),
        report.collect(httpEvents, 'readFileSync', { stack:true }),
        report.collect(httpEvents, 'createReadStream', { stack:true }),
    ]).then(results => {
        var callback = results[0]
        var sync = results[1]
        var stream = results[2]
        var reads = callback.map(r => {
            var data = {
                path:r.arguments[0],
                file:path.basename(r.arguments[0]),
                start:r.time,
                stack:r.stack,
                isCallback:true
            }

            if(r.callback) {
                data.elapsed = r.callback.elapsed
                data.finish = r.callback.time
            }

            return data
        }).concat(sync.map(r => {
            var data = {
                path:r.arguments[0],
                file:path.basename(r.arguments[0]),
                start:r.time,
                stack:r.stack,
                elapsed:r.return.elapsed,
                finish:r.return.time,
                isSync:true
            }

            return data
        })).concat(stream.map(r => {
            var data = {
                path:r.arguments[0],
                file:path.basename(r.arguments[0]),
                start:r.time,
                stack:r.stack,
                isStream:true
            }

            if(r.end) {
                data.elapsed = r.end.elapsed
                data.finish = r.time + r.end.elapsed
            }

            return data
        })).sort((a, b) => b.time - a.time)

        if(reads.length) {
            var chartData = getChartData(report, reads)
            report.section('FS Reads Timing').chart(chartData)
        } else {
            report.section('No FS Reads')
        }

        /*requests.forEach(request => {
            var section = requestsSection.section((request.url.protocol||'http:')+'//'+request.url.host, request.id)
            section.html('<strong>'+(request.method||'GET')+'</strong> '+(request.path||'/'))
            section.json(request.request._headers)
            if(request.response) {
                section.html('<strong>'+request.response.statusCode+' Response in '+request.elapsed+'ms:</strong> '+request.response.statusMessage)
                section.json(request.response.headers)
            }
            section.html('<strong>Call Stack</strong>')
            section.html('<p>'+request.stack.map(x => {
                var str = (x.name||'')+' '+x.file+':'+x.line+':'+x.char
                if(isProjectFile(x)) {
                    str = '<strong>'+str+'</strong>'
                }
                return str
            }).join('<br>')+'</p>')
        })*/

        report.end()
    }).catch(e => console.error(e))
}

function isProjectFile(x) {
    return x.file && x.file.indexOf('/') != -1 && x.file.indexOf('node_modules') == -1
}

function getChartData(report, reads) {
    return {
        chart: {
            type: 'columnrange',
            inverted: true
        },

        title: {
            text: 'FS Reads'
        },

        subtitle: {
            text: 'FS Reads Triggered by Current Request'
        },

        xAxis: {
            categories: reads.map(r => {
                return {
                    file:r.file,
                    path:r.path,
                    elapsed:r.elapsed,
                    isSync:r.isSync,
                    isStream:r.isStream,
                    isCallback:r.isCallback,
                }
            }),
            labels: {
                formatter: function() {
                    return this.value.file
                }
            }
        },

        yAxis: {
            title: {
                text: 'Timing (ms)'
            },
            minRange:1
        },

        tooltip: {
            useHTML: true,
            formatter: function() {
                var read = this.key
                return [
                    '<strong>',
                    read.path,
                    '</strong>',
                    ' in ',
                    read.elapsed,
                    'ms'
                ].join('')
            }
        },

        plotOptions: {
            series: {
                point: {
                    events:{
                        click: function() {
                            document.getElementById(this.category.id).scrollIntoView()
                        }
                    }
                },
                cursor:'pointer'
            }
        },

        legend: {
            enabled: false
        },

        series: [{
            name: 'Timing',
            data: reads.map(r => [r.start, r.finish])
        }]
    }
}