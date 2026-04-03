/*
  Rose Curve Distribution
  Distributes points along a polar rose curve: r = radius * cos(k * theta).
  Integer k gives k petals (odd k) or 2k petals (even k).
  Fractional k creates spiraling, never-closing patterns -- try 2.5, 3.7, etc.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Radius               (default: 300)
    n1  k                    (default: 5)   petal parameter
    n2  Point Count          (default: 500)

  Presets: k=3 (3 petals), k=4 (8 petals), k=2 (4 petals),
           k=0.5 (single loop), k=2.5 (spiraling 5-petal)
*/

function roseCurveDistribution() {
    var radius = (typeof n0 !== "undefined") ? n0 : 300;
    var k = (typeof n1 !== "undefined") ? n1 : 5;
    var count = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 1) : 500;

    var cloud = new cavalry.PointCloud();

    var isInteger = (k === Math.floor(k));
    var maxTheta;
    if (isInteger) {
        maxTheta = (k % 2 === 0) ? 2 * Math.PI : Math.PI;
    } else {
        maxTheta = 2 * Math.PI * Math.ceil(k);
    }

    for (var i = 0; i < count; i += 1) {
        var theta = maxTheta * i / count;
        var r = radius * Math.cos(k * theta);

        var px = r * Math.cos(theta);
        var py = r * Math.sin(theta);

        cloud.appendPoint(new cavalry.Point(px, py));
    }

    return cloud;
}

roseCurveDistribution();
