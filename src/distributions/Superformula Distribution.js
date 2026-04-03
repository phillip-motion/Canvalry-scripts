/*
  Superformula Distribution (Gielis)
  A single equation that generates circles, stars, flowers, rounded polygons,
  organic blobs, and everything in between by changing its parameters.

  r(theta) = ( |cos(m*theta/4)/a|^n2 + |sin(m*theta/4)/b|^n3 )^(-1/n1)

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Scale                (default: 200)
    n1  m                    (default: 6)   symmetry / number of lobes
    n2  a                    (default: 1)   x-axis rounding
    n3  b                    (default: 1)   y-axis rounding
    n4  n1                   (default: 1)   master exponent (overall inflation)
    n5  n2                   (default: 1)   cosine exponent
    n6  n3                   (default: 1)   sine exponent
    n7  Point Count          (default: 500)

  Presets (set n1/m, n2/a, n3/b, n4/n1, n5/n2, n6/n3):
    Circle:            m=0,  a=1, b=1, n1=1,   n2=1,   n3=1
    Rounded triangle:  m=3,  a=1, b=1, n1=5,   n2=18,  n3=18
    Starfish:          m=5,  a=1, b=1, n1=0.3, n2=0.3, n3=0.3
    Astroid:           m=4,  a=1, b=1, n1=2,   n2=2,   n3=2
    Flower:            m=12, a=1, b=1, n1=1,   n2=4,   n3=8
    Hexagonal:         m=6,  a=1, b=1, n1=1000,n2=400, n3=400
*/

function superformulaDistribution() {
    var scale = (typeof n0 !== "undefined") ? n0 : 200;
    var m = (typeof n1 !== "undefined") ? n1 : 6;
    var a = (typeof n2 !== "undefined") ? n2 : 1;
    var b = (typeof n3 !== "undefined") ? n3 : 1;
    var sn1 = (typeof n4 !== "undefined") ? n4 : 1;
    var sn2 = (typeof n5 !== "undefined") ? n5 : 1;
    var sn3 = (typeof n6 !== "undefined") ? n6 : 1;
    var count = (typeof n7 !== "undefined") ? Math.max(Math.round(n7), 1) : 500;

    var cloud = new cavalry.PointCloud();

    if (Math.abs(a) < 0.0001) { a = 0.0001; }
    if (Math.abs(b) < 0.0001) { b = 0.0001; }
    if (Math.abs(sn1) < 0.0001) { sn1 = 0.0001; }

    for (var i = 0; i < count; i += 1) {
        var theta = 2 * Math.PI * i / count;
        var mTheta4 = m * theta / 4;

        var termA = Math.abs(Math.cos(mTheta4) / a);
        var termB = Math.abs(Math.sin(mTheta4) / b);

        var r = Math.pow(Math.pow(termA, sn2) + Math.pow(termB, sn3), -1 / sn1);

        if (!isFinite(r)) { r = 0; }

        var px = scale * r * Math.cos(theta);
        var py = scale * r * Math.sin(theta);

        cloud.appendPoint(new cavalry.Point(px, py));
    }

    return cloud;
}

superformulaDistribution();
