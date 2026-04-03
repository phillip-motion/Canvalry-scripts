/*
  Hypotrochoid Distribution (Generalized Spirograph)
  A point attached to a circle of radius r rolling inside a fixed circle
  of radius R, with the pen at distance d from the rolling circle's centre.

  x = (R - r) * cos(t) + d * cos((R - r) * t / r)
  y = (R - r) * sin(t) - d * sin((R - r) * t / r)

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Outer Radius R       (default: 300)
    n1  Inner Radius r       (default: 100)
    n2  Pen Distance d       (default: 80)   distance from inner centre
    n3  Revolutions          (default: 10)   how many times around
    n4  Point Count          (default: 1000)

  Presets:
    Astroid:     R=300, r=75,  d=75   (R/r = 4)
    Deltoid:     R=300, r=100, d=100  (R/r = 3)
    5-pointed:   R=300, r=60,  d=60   (R/r = 5)
    Spirograph:  R=300, r=100, d=80   (pen offset from edge)
*/

function hypotrochoidDistribution() {
    var R = (typeof n0 !== "undefined") ? n0 : 300;
    var r = (typeof n1 !== "undefined") ? n1 : 100;
    var d = (typeof n2 !== "undefined") ? n2 : 80;
    var revolutions = (typeof n3 !== "undefined") ? Math.max(n3, 0.1) : 10;
    var count = (typeof n4 !== "undefined") ? Math.max(Math.round(n4), 1) : 1000;

    var cloud = new cavalry.PointCloud();

    if (Math.abs(r) < 0.001) { r = 0.001; }
    var totalAngle = revolutions * 2 * Math.PI;
    var diff = R - r;

    for (var i = 0; i < count; i += 1) {
        var t = totalAngle * i / count;

        var px = diff * Math.cos(t) + d * Math.cos(diff * t / r);
        var py = diff * Math.sin(t) - d * Math.sin(diff * t / r);

        cloud.appendPoint(new cavalry.Point(px, py));
    }

    return cloud;
}

hypotrochoidDistribution();
