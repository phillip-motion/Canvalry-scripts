/*
  Archimedean Spiral Distribution
  Distributes points along an Archimedean spiral: r = a + b * theta.
  Unlike the golden spiral, turns are evenly spaced.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Initial Radius a     (default: 0)
    n1  Growth Rate b        (default: 10)   distance between successive turns
    n2  Turns                (default: 8)
    n3  Point Count          (default: 500)
*/

function archimedeanSpiralDistribution() {
    var a = (typeof n0 !== "undefined") ? n0 : 0;
    var b = (typeof n1 !== "undefined") ? n1 : 10;
    var turns = (typeof n2 !== "undefined") ? Math.max(n2, 0.1) : 8;
    var count = (typeof n3 !== "undefined") ? Math.max(Math.round(n3), 1) : 500;

    var cloud = new cavalry.PointCloud();
    var totalAngle = turns * 2 * Math.PI;

    for (var i = 0; i < count; i += 1) {
        var theta = totalAngle * i / count;
        var r = a + b * theta;

        var px = r * Math.cos(theta);
        var py = r * Math.sin(theta);

        cloud.appendPoint(new cavalry.Point(px, py));
    }

    return cloud;
}

archimedeanSpiralDistribution();
