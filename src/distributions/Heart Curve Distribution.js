/*
  Heart Curve Distribution
  Distributes points along a parametric heart shape:
    x = 16 * sin(t)^3
    y = 13*cos(t) - 5*cos(2t) - 2*cos(3t) - cos(4t)

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Scale                (default: 20)
    n1  Point Count          (default: 500)
*/

function heartCurveDistribution() {
    var scale = (typeof n0 !== "undefined") ? n0 : 20;
    var count = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 1) : 500;

    var cloud = new cavalry.PointCloud();

    for (var i = 0; i < count; i += 1) {
        var t = 2 * Math.PI * i / count;
        var sinT = Math.sin(t);

        var px = 16 * sinT * sinT * sinT * scale;
        var py = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;

        cloud.appendPoint(new cavalry.Point(px, py));
    }

    return cloud;
}

heartCurveDistribution();
